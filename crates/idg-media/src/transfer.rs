use crate::{ffmpeg, resolver::safe_redirect};
use idg_core::download::{
    self, Checkpoint, Control, Job, MediaSegment, MediaTask, resources::Resources,
};
use idg_protocol::{DownloadError, MediaOutput, MediaStage, TransferState};
use reqwest::{Client, StatusCode, Url, header};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    time::Duration,
};
use tokio::sync::{Semaphore, watch};

const MAX_MEDIA_BYTES: u64 = 8 * 1024 * 1024 * 1024;
const MAX_SEGMENT_BYTES: u64 = 512 * 1024 * 1024;
const MAX_SEGMENTS: usize = 20_000;
const MAX_REDIRECTS: usize = 5;
const MIN_DURATION_TOLERANCE_SECONDS: f64 = 0.05;
const MAX_DURATION_TOLERANCE_SECONDS: f64 = 1.0;
const PROCESS_TIMEOUT: Duration = Duration::from_secs(6 * 60 * 60);
static PROCESSING: Semaphore = Semaphore::const_new(1);

pub async fn transfer_media(
    client: &Client,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    checkpoint: &mut dyn Checkpoint,
    resources: Arc<Resources>,
    tools: &ffmpeg::Tools,
) -> Result<(), DownloadError> {
    let Some(task) = job.media.as_mut() else {
        return Err(DownloadError::InvalidState);
    };
    if task.main_segments.len() + task.audio_segments.len() > MAX_SEGMENTS {
        return Err(DownloadError::Representation);
    }
    job.state = TransferState::Downloading;
    task.stage = MediaStage::Downloading;
    job.error = None;
    checkpoint.save(job)?;

    let base_temporary = PathBuf::from(&job.temporary);
    let result = async {
        download_track(client, job, true, resources.clone(), control, checkpoint).await?;
        if !job.media.as_ref().unwrap().audio_segments.is_empty() {
            download_track(client, job, false, resources.clone(), control, checkpoint).await?;
        }
        process_tracks(job, checkpoint, control, tools, &base_temporary).await
    }
    .await;

    resources.forget_file(&job.id);
    match result {
        Err(DownloadError::InvalidState) if *control.borrow() != Control::Run => {
            job.received = job.durable;
            if *control.borrow() == Control::Cancel {
                cleanup_sidecars(
                    &base_temporary,
                    job.media.as_ref().ok_or(DownloadError::InvalidState)?,
                );
                remove_owned_file(&base_temporary)?;
                job.state = TransferState::Cancelled;
            } else {
                job.state = TransferState::Paused;
            }
            checkpoint.save(job)
        }
        other => other,
    }
}

async fn download_track(
    client: &Client,
    job: &mut Job,
    main: bool,
    resources: Arc<Resources>,
    control: &mut watch::Receiver<Control>,
    checkpoint: &mut dyn Checkpoint,
) -> Result<(), DownloadError> {
    let count = if main {
        job.media.as_ref().unwrap().main_segments.len()
    } else {
        job.media.as_ref().unwrap().audio_segments.len()
    };
    for index in 0..count {
        if *control.borrow() != Control::Run {
            return Err(DownloadError::InvalidState);
        }
        let (segment, url) = {
            let task = job.media.as_mut().ok_or(DownloadError::InvalidState)?;
            let segment = if main {
                &mut task.main_segments[index]
            } else {
                &mut task.audio_segments[index]
            };
            (segment.clone(), segment.url.clone())
        };
        let final_path = segment_path(&job.temporary, main, index);
        if segment_matches(&final_path, &segment)? {
            continue;
        }
        remove_owned_file(&final_path)?;
        let partial_path = segment_partial_path(&job.temporary, main, index);
        remove_owned_file(&partial_path)?;

        let mut attempts = 0;
        let completed = loop {
            match download_segment(
                client,
                &url,
                &partial_path,
                job,
                resources.clone(),
                control,
                checkpoint,
            )
            .await
            {
                Ok(result) => break result,
                Err(error)
                    if attempts < 2
                        && matches!(
                            error,
                            DownloadError::Network
                                | DownloadError::Timeout
                                | DownloadError::RetryLater
                        ) =>
                {
                    attempts += 1;
                    job.retries = job.retries.saturating_add(1);
                    let wait = Duration::from_millis(250u64 << attempts);
                    download::resources::delay(wait, control).await?;
                    remove_owned_file(&partial_path)?;
                }
                Err(error) => return Err(error),
            }
        };
        if completed.bytes == 0 || completed.bytes > MAX_SEGMENT_BYTES {
            return Err(DownloadError::Representation);
        }
        fs::rename(&partial_path, &final_path).map_err(download::file_error)?;
        let task = job.media.as_mut().ok_or(DownloadError::InvalidState)?;
        let checkpointed = if main {
            &mut task.main_segments[index]
        } else {
            &mut task.audio_segments[index]
        };
        checkpointed.bytes = Some(completed.bytes);
        checkpointed.sha256 = Some(completed.sha256);
        job.durable = job
            .durable
            .checked_add(completed.bytes)
            .filter(|value| *value <= MAX_MEDIA_BYTES)
            .ok_or(DownloadError::Representation)?;
        job.received = job.durable;
        job.total = None;
        job.transferred = job.transferred.saturating_add(completed.bytes);
        checkpoint.save(job)?;
    }
    Ok(())
}

struct SegmentResult {
    bytes: u64,
    sha256: String,
}

async fn download_segment(
    client: &Client,
    raw_url: &str,
    partial_path: &Path,
    job: &mut Job,
    resources: Arc<Resources>,
    control: &mut watch::Receiver<Control>,
    checkpoint: &mut dyn Checkpoint,
) -> Result<SegmentResult, DownloadError> {
    let mut url = Url::parse(raw_url).map_err(|_| DownloadError::InvalidInput)?;
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err(DownloadError::InvalidInput);
    }
    url.set_fragment(None);

    let mut redirects = 0;
    let (mut response, _permit) = loop {
        let permit = resources
            .acquire(
                &job.id,
                &url.origin().ascii_serialization(),
                job.options.priority.clone(),
                control,
            )
            .await?;
        let response = client
            .get(url.clone())
            .header(header::ACCEPT_ENCODING, "identity")
            .send()
            .await
            .map_err(|error| {
                if error.is_timeout() {
                    DownloadError::Timeout
                } else {
                    DownloadError::Network
                }
            })?;
        if response.status().is_redirection() {
            if redirects == MAX_REDIRECTS {
                return Err(DownloadError::HttpStatus);
            }
            let location = response
                .headers()
                .get(header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or(DownloadError::HttpStatus)?;
            let next = url.join(location).map_err(|_| DownloadError::HttpStatus)?;
            if !safe_redirect(&url, &next) {
                return Err(DownloadError::AccessDenied);
            }
            drop(permit);
            redirects += 1;
            url = next;
            continue;
        }
        if response.status() == StatusCode::TOO_MANY_REQUESTS || response.status().is_server_error()
        {
            return Err(DownloadError::RetryLater);
        }
        if response.status() != StatusCode::OK {
            if matches!(
                response.status(),
                StatusCode::UNAUTHORIZED | StatusCode::FORBIDDEN | StatusCode::GONE
            ) {
                return Err(DownloadError::Expired);
            }
            return Err(DownloadError::HttpStatus);
        }
        if response
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| {
                let mime = value.split(';').next().unwrap_or(value).trim();
                matches!(mime, "text/html" | "application/xhtml+xml")
            })
        {
            return Err(DownloadError::Representation);
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_SEGMENT_BYTES)
        {
            return Err(DownloadError::Representation);
        }
        break (response, permit);
    };

    ensure_sidecar_parent(&job.temporary, partial_path)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(partial_path)
        .map_err(download::file_error)?;
    let mut hasher = Sha256::new();
    let mut bytes = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(|error| {
        if error.is_timeout() {
            DownloadError::Timeout
        } else {
            DownloadError::Network
        }
    })? {
        if *control.borrow() != Control::Run {
            return Err(DownloadError::InvalidState);
        }
        bytes = bytes
            .checked_add(chunk.len() as u64)
            .filter(|size| *size <= MAX_SEGMENT_BYTES)
            .ok_or(DownloadError::Representation)?;
        if job.durable.saturating_add(bytes) > MAX_MEDIA_BYTES {
            return Err(DownloadError::Representation);
        }
        resources
            .pace(&job.id, job.options.bytes_per_second, chunk.len(), control)
            .await?;
        output.write_all(&chunk).map_err(download::file_error)?;
        hasher.update(&chunk);
        job.received = job.durable.saturating_add(bytes);
        checkpoint.progress(job);
    }
    output.flush().map_err(download::file_error)?;
    output.sync_all().map_err(download::file_error)?;
    drop(output);
    drop(_permit);
    Ok(SegmentResult {
        bytes,
        sha256: format!("{:x}", hasher.finalize()),
    })
}

async fn process_tracks(
    job: &mut Job,
    checkpoint: &mut dyn Checkpoint,
    control: &mut watch::Receiver<Control>,
    tools: &ffmpeg::Tools,
    base_temporary: &Path,
) -> Result<(), DownloadError> {
    let _processing = tokio::select! {
        biased;
        _ = download::resources::interrupted(control) => return Err(DownloadError::InvalidState),
        permit = PROCESSING.acquire() => permit.map_err(|_| DownloadError::Busy)?,
    };
    let task = job
        .media
        .as_ref()
        .ok_or(DownloadError::InvalidState)?
        .clone();
    job.state = TransferState::Processing;
    job.media.as_mut().unwrap().stage = MediaStage::Combining;
    checkpoint.save(job)?;
    let video_source = (!task.main_segments.is_empty())
        .then(|| combine_track(&job.temporary, "main", &task.main_segments, control))
        .transpose()?;
    let audio_source = (!task.audio_segments.is_empty())
        .then(|| combine_track(&job.temporary, "audio", &task.audio_segments, control))
        .transpose()?;
    let mut inputs = Vec::new();
    let video_input = video_source.as_ref().map(|path| {
        inputs.push(path.clone());
        (inputs.len() - 1) as u16
    });
    let audio_input = audio_source.as_ref().map(|path| {
        inputs.push(path.clone());
        (inputs.len() - 1) as u16
    });
    if inputs.is_empty() {
        return Err(DownloadError::Representation);
    }
    let selection = ffmpeg::StreamSelection {
        video: if task.main_is_video {
            Some(ffmpeg::TrackRef {
                input: video_input.ok_or(DownloadError::Representation)?,
                stream: 0,
            })
        } else {
            None
        },
        audio: if let Some(input) = audio_input {
            Some(ffmpeg::TrackRef { input, stream: 0 })
        } else if task.main_has_audio {
            Some(ffmpeg::TrackRef {
                input: video_input.ok_or(DownloadError::Representation)?,
                stream: 0,
            })
        } else {
            None
        },
    };
    let format = output_format(&task.selection.output)?;
    let output_path = next_output_path(base_temporary)?;
    // FFmpeg and ffprobe receive only fully downloaded, local, app-owned files.
    let processed = match ffmpeg::process_local(
        tools,
        &inputs,
        &output_path,
        format,
        selection,
        PROCESS_TIMEOUT,
        || *control.borrow() != Control::Run,
    ) {
        Ok(processed) => processed,
        Err(error) => {
            remove_owned_file(&output_path)?;
            return Err(map_ffmpeg_error(error));
        }
    };
    if *control.borrow() != Control::Run {
        remove_owned_file(&output_path)?;
        return Err(DownloadError::InvalidState);
    }
    let output_size = fs::metadata(&output_path)
        .map_err(download::file_error)?
        .len();
    if !duration_matches(task.duration_ms, processed.duration_seconds)
        || output_size > MAX_MEDIA_BYTES
    {
        remove_owned_file(&output_path)?;
        return Err(DownloadError::Representation);
    }
    job.temporary = output_path.to_string_lossy().into_owned();
    job.state = TransferState::Verifying;
    job.media.as_mut().unwrap().stage = MediaStage::Verifying;
    checkpoint.save(job)?;
    download::publish_generated(job, checkpoint).await?;
    cleanup_sidecars(base_temporary, &task);
    Ok(())
}

fn duration_matches(expected_ms: Option<u64>, actual_seconds: f64) -> bool {
    if !actual_seconds.is_finite() || actual_seconds <= 0.0 {
        return false;
    }
    let Some(expected_ms) = expected_ms else {
        return true;
    };
    let expected_seconds = expected_ms as f64 / 1000.0;
    let tolerance = (expected_seconds * 0.01).clamp(
        MIN_DURATION_TOLERANCE_SECONDS,
        MAX_DURATION_TOLERANCE_SECONDS,
    );
    (expected_seconds - actual_seconds).abs() <= tolerance
}

fn output_format(output: &MediaOutput) -> Result<ffmpeg::OutputFormat, DownloadError> {
    match output {
        MediaOutput::Mp4 => Ok(ffmpeg::OutputFormat::Mp4),
        MediaOutput::Matroska => Ok(ffmpeg::OutputFormat::Matroska),
        MediaOutput::AudioOriginal => Ok(ffmpeg::OutputFormat::AudioOriginal),
        MediaOutput::Mp3 => Ok(ffmpeg::OutputFormat::Mp3),
        MediaOutput::Aac => Ok(ffmpeg::OutputFormat::Aac),
        MediaOutput::Flac => Ok(ffmpeg::OutputFormat::Flac),
    }
}

fn map_ffmpeg_error(error: ffmpeg::Error) -> DownloadError {
    match error {
        ffmpeg::Error::Cancelled => DownloadError::InvalidState,
        ffmpeg::Error::TimedOut => DownloadError::Timeout,
        ffmpeg::Error::InvalidExecutable => DownloadError::InvalidInput,
        ffmpeg::Error::InvalidStreams | ffmpeg::Error::MissingStreams => {
            DownloadError::Representation
        }
        ffmpeg::Error::Io(std::io::ErrorKind::StorageFull) => DownloadError::DiskFull,
        ffmpeg::Error::Io(_) => DownloadError::FileIo,
        _ => DownloadError::Representation,
    }
}

fn segment_path(temporary: &str, main: bool, index: usize) -> PathBuf {
    sidecar_path(
        temporary,
        format!("{}-{index:05}.seg", if main { "video" } else { "audio" }),
    )
}

fn segment_partial_path(temporary: &str, main: bool, index: usize) -> PathBuf {
    sidecar_path(
        temporary,
        format!(
            "{}-{index:05}.partial",
            if main { "video" } else { "audio" }
        ),
    )
}

fn track_path(temporary: &str, name: &str) -> PathBuf {
    sidecar_path(temporary, format!("{name}.track"))
}

fn sidecar_path(temporary: &str, suffix: String) -> PathBuf {
    PathBuf::from(format!("{temporary}.media-{suffix}"))
}

fn ensure_sidecar_parent(temporary: &str, path: &Path) -> Result<(), DownloadError> {
    let base = Path::new(temporary);
    let parent = base.parent().ok_or(DownloadError::InvalidInput)?;
    let canonical = fs::canonicalize(parent).map_err(download::file_error)?;
    if fs::canonicalize(path.parent().ok_or(DownloadError::InvalidInput)?)
        .map_err(download::file_error)?
        != canonical
    {
        return Err(DownloadError::InvalidInput);
    }
    if let Ok(metadata) = fs::symlink_metadata(path)
        && (!metadata.is_file() || metadata.file_type().is_symlink())
    {
        return Err(DownloadError::InvalidInput);
    }
    Ok(())
}

fn remove_owned_file(path: &Path) -> Result<(), DownloadError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
            fs::remove_file(path).map_err(download::file_error)
        }
        Ok(_) => Err(DownloadError::InvalidInput),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(download::file_error(error)),
    }
}

fn segment_matches(path: &Path, segment: &MediaSegment) -> Result<bool, DownloadError> {
    let (Some(expected_bytes), Some(expected_hash)) = (segment.bytes, segment.sha256.as_deref())
    else {
        return Ok(false);
    };
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
        Ok(_) => return Err(DownloadError::InvalidInput),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(download::file_error(error)),
    };
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(download::file_error(error)),
    };
    if metadata.len() != expected_bytes {
        return Ok(false);
    }
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let read = file.read(&mut buffer).map_err(download::file_error)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()) == expected_hash)
}

fn combine_track(
    temporary: &str,
    name: &str,
    segments: &[MediaSegment],
    control: &watch::Receiver<Control>,
) -> Result<PathBuf, DownloadError> {
    if segments.is_empty() {
        return Err(DownloadError::Representation);
    }
    let output_path = track_path(temporary, name);
    ensure_sidecar_parent(temporary, &output_path)?;
    remove_owned_file(&output_path)?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&output_path)
        .map_err(download::file_error)?;
    let mut total = 0u64;
    let mut buffer = [0u8; 65536];
    for (index, segment) in segments.iter().enumerate() {
        if *control.borrow() != Control::Run {
            return Err(DownloadError::InvalidState);
        }
        let input_path = segment_path(temporary, name == "main", index);
        if !segment_matches(&input_path, segment)? {
            return Err(DownloadError::PartialChanged);
        }
        let mut input = File::open(input_path).map_err(download::file_error)?;
        loop {
            if *control.borrow() != Control::Run {
                return Err(DownloadError::InvalidState);
            }
            let count = input.read(&mut buffer).map_err(download::file_error)?;
            if count == 0 {
                break;
            }
            total = total
                .checked_add(count as u64)
                .filter(|size| *size <= MAX_MEDIA_BYTES)
                .ok_or(DownloadError::Representation)?;
            output
                .write_all(&buffer[..count])
                .map_err(download::file_error)?;
        }
    }
    output.flush().map_err(download::file_error)?;
    output.sync_all().map_err(download::file_error)?;
    Ok(output_path)
}

fn next_output_path(base: &Path) -> Result<PathBuf, DownloadError> {
    let metadata = fs::symlink_metadata(base).map_err(download::file_error)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(DownloadError::InvalidInput);
    }
    if metadata.len() == 0 {
        fs::remove_file(base).map_err(download::file_error)?;
        return Ok(base.to_path_buf());
    }
    for attempt in 1..=1000 {
        let candidate = PathBuf::from(format!("{}.media-output-{attempt}.idgpart", base.display()));
        match fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Ok(_) => continue,
            Err(error) => return Err(download::file_error(error)),
        }
    }
    Err(DownloadError::Busy)
}

fn cleanup_sidecars(base: &Path, task: &MediaTask) {
    let temporary = base.to_string_lossy();
    for (main, segments) in [(true, &task.main_segments), (false, &task.audio_segments)] {
        for index in 0..segments.len() {
            let _ = remove_owned_file(&segment_path(&temporary, main, index));
            let _ = remove_owned_file(&segment_partial_path(&temporary, main, index));
        }
    }
    let _ = remove_owned_file(&track_path(&temporary, "main"));
    let _ = remove_owned_file(&track_path(&temporary, "audio"));
}

#[cfg(test)]
mod tests {
    use super::duration_matches;

    #[test]
    fn output_duration_must_match_declared_manifest_duration_with_bounded_tolerance() {
        assert!(duration_matches(Some(3_000), 3.04));
        assert!(!duration_matches(Some(3_000), 2.8));
        assert!(!duration_matches(Some(3_000), 3.2));
        assert!(duration_matches(None, 1.0));
        assert!(!duration_matches(None, f64::NAN));
        assert!(!duration_matches(None, 0.0));
    }
}
