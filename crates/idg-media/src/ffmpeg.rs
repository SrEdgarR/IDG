use std::ffi::OsString;
use std::fs;
use std::io::{self, Read};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

const MAX_TIMEOUT: Duration = Duration::from_secs(6 * 60 * 60);
const POLL_INTERVAL: Duration = Duration::from_millis(25);
const MAX_PROBE_OUTPUT: usize = 1024 * 1024;
const MAX_INPUT_FILES: usize = 16;

#[derive(Clone, Debug)]
pub struct Tools {
    pub ffmpeg: PathBuf,
    pub ffprobe: PathBuf,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutputFormat {
    Mp4,
    Matroska,
    AudioOriginal,
    Mp3,
    Aac,
    Flac,
}

impl TryFrom<&str> for OutputFormat {
    type Error = Error;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "mp4" => Ok(Self::Mp4),
            "mkv" => Ok(Self::Matroska),
            "audio_original" => Ok(Self::AudioOriginal),
            "mp3" => Ok(Self::Mp3),
            "aac" => Ok(Self::Aac),
            "flac" => Ok(Self::Flac),
            _ => Err(Error::InvalidFormat),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TrackRef {
    /// Index in the input slice passed to `process_local`.
    pub input: u16,
    /// Zero-based index among this input's streams of the selected media type.
    pub stream: u16,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct StreamSelection {
    pub video: Option<TrackRef>,
    pub audio: Option<TrackRef>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct VerifiedMedia {
    pub duration_seconds: f64,
    pub has_audio: bool,
    pub has_video: bool,
}

#[derive(Debug, Eq, PartialEq)]
pub enum Error {
    InvalidExecutable,
    InvalidInput,
    InvalidOutput,
    OutputExists,
    InvalidFormat,
    InvalidStreams,
    EncoderUnavailable,
    Cancelled,
    TimedOut,
    ProcessFailed(Option<i32>),
    ProbeOutputTooLarge,
    InvalidProbeOutput,
    MissingStreams,
    InvalidDuration,
    Io(io::ErrorKind),
}

/// Process local inputs into a new staging file and verify it with ffprobe.
/// The callback is polled while either child process runs, so the runtime worker can
/// terminate processing without transferring cancellation to the UI process.
/// `output` must be an absent, caller-owned staging path (for example, its `.idgpart`).
/// MP4 and Matroska use stream copy. Audio encoding happens only when the caller explicitly
/// selects an audio-only output format. AAC is allowed only when this FFmpeg binary lists
/// its `aac` encoder. This function never publishes or removes the
/// staging file; the runtime owns cleanup.
pub fn process_local(
    tools: &Tools,
    inputs: &[PathBuf],
    output: &Path,
    format: OutputFormat,
    streams: StreamSelection,
    timeout: Duration,
    mut cancelled: impl FnMut() -> bool,
) -> Result<VerifiedMedia, Error> {
    if timeout.is_zero() || timeout > MAX_TIMEOUT {
        return Err(Error::TimedOut);
    }

    let ffmpeg = resolve_executable(&tools.ffmpeg)?;
    let ffprobe = resolve_executable(&tools.ffprobe)?;
    let inputs = resolve_inputs(inputs)?;
    let output = resolve_new_output(output)?;
    validate_streams(inputs.len(), format, streams)?;
    let deadline = Instant::now() + timeout;

    (|| {
        if format == OutputFormat::Aac {
            ensure_aac_encoder(&ffmpeg, deadline, &mut cancelled)?;
        }
        let args = ffmpeg_args(&inputs, &output, format, streams);
        let mut command = Command::new(ffmpeg);
        command.args(args);
        run_child(command, deadline, &mut cancelled, false)?;
        if !output.is_file() {
            return Err(Error::ProcessFailed(None));
        }

        let mut probe = Command::new(ffprobe);
        probe.args(ffprobe_args(&output, format));
        let json =
            run_child(probe, deadline, &mut cancelled, true)?.ok_or(Error::InvalidProbeOutput)?;
        parse_probe(&json, format, streams)
    })()
}

fn validate_streams(
    input_count: usize,
    format: OutputFormat,
    streams: StreamSelection,
) -> Result<(), Error> {
    if streams.video.is_none() && streams.audio.is_none() {
        return Err(Error::InvalidStreams);
    }
    for track in [streams.video, streams.audio].into_iter().flatten() {
        if usize::from(track.input) >= input_count {
            return Err(Error::InvalidStreams);
        }
    }
    match format {
        OutputFormat::Mp4 if streams.video.is_none() => Err(Error::InvalidStreams),
        OutputFormat::AudioOriginal
        | OutputFormat::Mp3
        | OutputFormat::Aac
        | OutputFormat::Flac
            if streams.audio.is_none() || streams.video.is_some() =>
        {
            Err(Error::InvalidStreams)
        }
        _ => Ok(()),
    }
}

fn ffmpeg_args(
    inputs: &[PathBuf],
    output: &Path,
    format: OutputFormat,
    streams: StreamSelection,
) -> Vec<OsString> {
    let mut args = vec!["-hide_banner", "-loglevel", "error", "-nostats", "-nostdin"]
        .into_iter()
        .map(OsString::from)
        .collect::<Vec<_>>();
    for input in inputs {
        args.extend([
            OsString::from("-protocol_whitelist"),
            OsString::from("file"),
            OsString::from("-threads"),
            OsString::from("2"),
            OsString::from("-i"),
            input.as_os_str().to_os_string(),
        ]);
    }

    if let Some(video) = streams.video {
        args.extend([
            OsString::from("-map"),
            format!("{}:v:{}", video.input, video.stream).into(),
        ]);
    }
    if let Some(audio) = streams.audio {
        args.extend([
            OsString::from("-map"),
            format!("{}:a:{}", audio.input, audio.stream).into(),
        ]);
    } else if let Some(video) = streams.video {
        // Direct HLS playlists can carry both tracks without declaring an audio
        // rendition. Preserve an embedded audio stream when one exists.
        args.extend([
            OsString::from("-map"),
            format!("{}:a:0?", video.input).into(),
        ]);
    }

    match format {
        OutputFormat::Mp4 | OutputFormat::Matroska => {
            args.extend([OsString::from("-c"), OsString::from("copy")]);
        }
        OutputFormat::Mp3 => args.extend([
            OsString::from("-vn"),
            OsString::from("-c:a"),
            OsString::from("libmp3lame"),
        ]),
        OutputFormat::Aac => args.extend([
            OsString::from("-vn"),
            OsString::from("-c:a"),
            OsString::from("aac"),
        ]),
        OutputFormat::AudioOriginal => args.extend([
            OsString::from("-vn"),
            OsString::from("-c:a"),
            OsString::from("copy"),
        ]),
        OutputFormat::Flac => args.extend([
            OsString::from("-vn"),
            OsString::from("-c:a"),
            OsString::from("flac"),
        ]),
    }

    args.extend([
        OsString::from("-threads"),
        OsString::from("2"),
        OsString::from("-n"),
        OsString::from("-f"),
        OsString::from(muxer(format)),
        output.as_os_str().to_os_string(),
    ]);
    args
}

fn muxer(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Mp4 => "mp4",
        OutputFormat::Matroska => "matroska",
        OutputFormat::AudioOriginal => "matroska",
        OutputFormat::Mp3 => "mp3",
        OutputFormat::Aac => "adts",
        OutputFormat::Flac => "flac",
    }
}

fn ffprobe_args(output: &Path, format: OutputFormat) -> Vec<OsString> {
    vec![
        "-v".into(),
        "error".into(),
        "-protocol_whitelist".into(),
        "file".into(),
        "-f".into(),
        probe_demuxer(format).into(),
        "-show_entries".into(),
        "format=duration:stream=codec_type".into(),
        "-of".into(),
        "json".into(),
        output.as_os_str().to_os_string(),
    ]
}

fn probe_demuxer(format: OutputFormat) -> &'static str {
    match format {
        OutputFormat::Mp4 => "mp4",
        OutputFormat::Matroska | OutputFormat::AudioOriginal => "matroska",
        OutputFormat::Mp3 => "mp3",
        OutputFormat::Aac => "aac",
        OutputFormat::Flac => "flac",
    }
}

fn resolve_executable(path: &Path) -> Result<PathBuf, Error> {
    let path = canonical_local_absolute(path).map_err(|_| Error::InvalidExecutable)?;
    if !path.is_file() {
        return Err(Error::InvalidExecutable);
    }
    Ok(path)
}

fn resolve_input(path: &Path) -> Result<PathBuf, Error> {
    let path = canonical_local_absolute(path).map_err(|_| Error::InvalidInput)?;
    if !path.is_file() {
        return Err(Error::InvalidInput);
    }
    Ok(path)
}

fn resolve_inputs(inputs: &[PathBuf]) -> Result<Vec<PathBuf>, Error> {
    if inputs.is_empty() || inputs.len() > MAX_INPUT_FILES {
        return Err(Error::InvalidInput);
    }
    inputs.iter().map(|input| resolve_input(input)).collect()
}

fn resolve_new_output(path: &Path) -> Result<PathBuf, Error> {
    if !path.is_absolute() {
        return Err(Error::InvalidOutput);
    }
    let Some(file_name) = path.file_name() else {
        return Err(Error::InvalidOutput);
    };
    if !matches!(
        Path::new(file_name).components().next(),
        Some(Component::Normal(_))
    ) {
        return Err(Error::InvalidOutput);
    }
    let parent = path.parent().ok_or(Error::InvalidOutput)?;
    let parent = canonical_local_absolute(parent).map_err(|_| Error::InvalidOutput)?;
    if !parent.is_dir() {
        return Err(Error::InvalidOutput);
    }
    let output = parent.join(file_name);
    match fs::symlink_metadata(&output) {
        Ok(_) => return Err(Error::OutputExists),
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(map_io(error)),
    }
    Ok(output)
}

fn canonical_local_absolute(path: &Path) -> io::Result<PathBuf> {
    if !path.is_absolute() {
        return Err(io::Error::new(io::ErrorKind::InvalidInput, "relative path"));
    }
    let path = path.canonicalize()?;
    #[cfg(windows)]
    if !matches!(path.components().next(), Some(Component::Prefix(prefix)) if matches!(
        prefix.kind(),
        std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)
    )) {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "non-local path",
        ));
    }
    Ok(path)
}

fn run_child(
    mut command: Command,
    deadline: Instant,
    cancelled: &mut impl FnMut() -> bool,
    capture_stdout: bool,
) -> Result<Option<Vec<u8>>, Error> {
    command
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .stdout(if capture_stdout {
            Stdio::piped()
        } else {
            Stdio::null()
        });
    if cancelled() {
        return Err(Error::Cancelled);
    }
    if Instant::now() >= deadline {
        return Err(Error::TimedOut);
    }
    let mut child = command.spawn().map_err(map_io)?;
    let output_reader = capture_stdout.then(|| spawn_bounded_reader(&mut child));

    let status = loop {
        if cancelled() {
            stop_child(&mut child);
            let _ = join_reader(output_reader);
            return Err(Error::Cancelled);
        }
        if Instant::now() >= deadline {
            stop_child(&mut child);
            let _ = join_reader(output_reader);
            return Err(Error::TimedOut);
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(POLL_INTERVAL),
            Err(error) => {
                stop_child(&mut child);
                let _ = join_reader(output_reader);
                return Err(map_io(error));
            }
        }
    };
    finish_child(status, output_reader)
}

fn spawn_bounded_reader(child: &mut Child) -> JoinHandle<Result<Vec<u8>, Error>> {
    let mut stdout = child.stdout.take().expect("stdout is piped");
    thread::spawn(move || {
        let mut output = Vec::with_capacity(MAX_PROBE_OUTPUT);
        let mut buffer = [0_u8; 8192];
        let mut too_large = false;
        loop {
            let count = stdout.read(&mut buffer).map_err(map_io)?;
            if count == 0 {
                break;
            }
            let room = MAX_PROBE_OUTPUT.saturating_sub(output.len());
            let keep = count.min(room);
            output.extend_from_slice(&buffer[..keep]);
            too_large |= keep != count;
        }
        if too_large {
            Err(Error::ProbeOutputTooLarge)
        } else {
            Ok(output)
        }
    })
}

fn stop_child(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn finish_child(
    status: ExitStatus,
    output_reader: Option<JoinHandle<Result<Vec<u8>, Error>>>,
) -> Result<Option<Vec<u8>>, Error> {
    let output = join_reader(output_reader)?;
    if !status.success() {
        return Err(Error::ProcessFailed(status.code()));
    }
    Ok(output)
}

fn join_reader(
    reader: Option<JoinHandle<Result<Vec<u8>, Error>>>,
) -> Result<Option<Vec<u8>>, Error> {
    reader
        .map(|reader| reader.join().map_err(|_| Error::InvalidProbeOutput)?)
        .transpose()
}

fn map_io(error: io::Error) -> Error {
    Error::Io(error.kind())
}

fn ensure_aac_encoder(
    ffmpeg: &Path,
    deadline: Instant,
    cancelled: &mut impl FnMut() -> bool,
) -> Result<(), Error> {
    let mut command = Command::new(ffmpeg);
    command.args(["-hide_banner", "-encoders"]);
    let output = run_child(command, deadline, cancelled, true)?.ok_or(Error::EncoderUnavailable)?;
    if encoder_list_contains(&output, "aac") {
        Ok(())
    } else {
        Err(Error::EncoderUnavailable)
    }
}

fn encoder_list_contains(list: &[u8], name: &str) -> bool {
    String::from_utf8_lossy(list).lines().any(|line| {
        let mut fields = line.split_ascii_whitespace();
        fields.next().is_some_and(|flags| flags.starts_with('A')) && fields.next() == Some(name)
    })
}

fn parse_probe(
    json: &[u8],
    format: OutputFormat,
    streams: StreamSelection,
) -> Result<VerifiedMedia, Error> {
    let value: serde_json::Value =
        serde_json::from_slice(json).map_err(|_| Error::InvalidProbeOutput)?;
    let duration = value
        .get("format")
        .and_then(|format| format.get("duration"))
        .and_then(|duration| {
            duration
                .as_f64()
                .or_else(|| duration.as_str().and_then(|duration| duration.parse().ok()))
        })
        .filter(|duration| duration.is_finite() && *duration > 0.0)
        .ok_or(Error::InvalidDuration)?;
    let stream_types = value
        .get("streams")
        .and_then(serde_json::Value::as_array)
        .ok_or(Error::MissingStreams)?
        .iter()
        .filter_map(|stream| stream.get("codec_type").and_then(serde_json::Value::as_str))
        .collect::<Vec<_>>();
    let has_audio = stream_types.contains(&"audio");
    let has_video = stream_types.contains(&"video");

    let valid = match format {
        OutputFormat::AudioOriginal
        | OutputFormat::Mp3
        | OutputFormat::Aac
        | OutputFormat::Flac => has_audio && !has_video,
        OutputFormat::Mp4 => has_video && (streams.audio.is_none() || has_audio),
        OutputFormat::Matroska => {
            (streams.audio.is_none() || has_audio)
                && (streams.video.is_none() || has_video)
                && (has_audio || has_video)
        }
    };
    if !valid {
        return Err(Error::MissingStreams);
    }
    Ok(VerifiedMedia {
        duration_seconds: duration,
        has_audio,
        has_video,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_DIR: AtomicU64 = AtomicU64::new(0);

    fn temp_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "idg-ffmpeg-test-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    fn has_pair(values: &[String], first: &str, second: &str) -> bool {
        values
            .windows(2)
            .any(|pair| pair[0] == first && pair[1] == second)
    }

    #[test]
    fn rejects_relative_executable_and_network_input() {
        assert_eq!(
            resolve_executable(Path::new("ffmpeg")),
            Err(Error::InvalidExecutable)
        );
        assert_eq!(
            resolve_input(Path::new("https://example.test/video.mp4")),
            Err(Error::InvalidInput)
        );
        assert_eq!(
            resolve_new_output(Path::new("output.mp4")),
            Err(Error::InvalidOutput)
        );
    }

    #[test]
    fn format_is_an_exact_allowlist() {
        assert_eq!(OutputFormat::try_from("mp4"), Ok(OutputFormat::Mp4));
        assert_eq!(
            OutputFormat::try_from("mp4; echo unsafe"),
            Err(Error::InvalidFormat)
        );
        assert_eq!(OutputFormat::try_from("wav"), Err(Error::InvalidFormat));
        assert_eq!(OutputFormat::try_from("aac"), Ok(OutputFormat::Aac));
        assert_eq!(
            OutputFormat::try_from("audio_original"),
            Ok(OutputFormat::AudioOriginal)
        );
    }

    #[test]
    fn aac_is_available_only_when_listed_as_an_audio_encoder() {
        assert!(encoder_list_contains(
            b"Encoders:\n A..... aac Advanced Audio Coding\n",
            "aac"
        ));
        assert!(!encoder_list_contains(
            b"Encoders:\n V..... hevc Example video codec\n",
            "aac"
        ));
        assert!(!encoder_list_contains(b"Encoders:\n", "aac"));
    }

    #[test]
    fn separate_tracks_map_to_their_input_and_stream_indexes_with_copy() {
        let directory = temp_dir();
        let video = directory.join("video & echo unsafe.mp4");
        let audio = directory.join("audio input.m4a");
        let output = directory.join("output & echo unsafe.mp4");
        let args = ffmpeg_args(
            &[video.clone(), audio.clone()],
            &output,
            OutputFormat::Mp4,
            StreamSelection {
                video: Some(TrackRef {
                    input: 0,
                    stream: 1,
                }),
                audio: Some(TrackRef {
                    input: 1,
                    stream: 0,
                }),
            },
        );
        assert!(args.iter().any(|arg| arg == video.as_os_str()));
        assert!(args.iter().any(|arg| arg == audio.as_os_str()));
        assert!(args.iter().any(|arg| arg == output.as_os_str()));
        let values = args
            .iter()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        assert!(has_pair(&values, "-map", "0:v:1"));
        assert!(has_pair(&values, "-map", "1:a:0"));
        assert!(has_pair(&values, "-c", "copy"));
        assert_eq!(values.iter().filter(|arg| arg.as_str() == "-i").count(), 2);
        assert_eq!(
            values
                .windows(2)
                .filter(|pair| pair[0] == "-protocol_whitelist" && pair[1] == "file")
                .count(),
            2
        );
        assert!(!values.iter().any(|arg| arg == "libx264"));
        assert!(!values.iter().any(|arg| arg == "unsafe"));

        let matroska = ffmpeg_args(
            &[video.clone(), audio.clone()],
            &directory.join("output.idgpart"),
            OutputFormat::Matroska,
            StreamSelection {
                video: Some(TrackRef {
                    input: 0,
                    stream: 1,
                }),
                audio: Some(TrackRef {
                    input: 1,
                    stream: 0,
                }),
            },
        )
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        assert!(has_pair(&matroska, "-c", "copy"));
        assert!(has_pair(&matroska, "-f", "matroska"));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn video_without_selected_audio_keeps_an_embedded_audio_track_if_present() {
        let directory = temp_dir();
        let args = ffmpeg_args(
            &[directory.join("direct-hls.track")],
            &directory.join("direct-hls.idgpart"),
            OutputFormat::Mp4,
            StreamSelection {
                video: Some(TrackRef {
                    input: 0,
                    stream: 0,
                }),
                audio: None,
            },
        )
        .iter()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect::<Vec<_>>();
        assert!(has_pair(&args, "-map", "0:v:0"));
        assert!(has_pair(&args, "-map", "0:a:0?"));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn audio_conversion_only_uses_the_explicitly_selected_audio_track() {
        let directory = temp_dir();
        let inputs = [directory.join("video.mp4"), directory.join("audio.m4a")];
        let streams = StreamSelection {
            video: None,
            audio: Some(TrackRef {
                input: 1,
                stream: 2,
            }),
        };

        for (format, codec, muxer) in [
            (OutputFormat::Mp3, "libmp3lame", "mp3"),
            (OutputFormat::Aac, "aac", "adts"),
            (OutputFormat::Flac, "flac", "flac"),
            (OutputFormat::AudioOriginal, "copy", "matroska"),
        ] {
            assert_eq!(validate_streams(inputs.len(), format, streams), Ok(()));
            let args = ffmpeg_args(&inputs, &directory.join("audio.idgpart"), format, streams);
            let values = args
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            assert!(has_pair(&values, "-map", "1:a:2"));
            assert!(has_pair(&values, "-c:a", codec));
            assert!(has_pair(&values, "-f", muxer));
            assert!(values.iter().any(|arg| arg == "-vn"));
            assert!(!values.iter().any(|arg| arg == "-c"));
        }

        assert_eq!(
            validate_streams(
                inputs.len(),
                OutputFormat::Mp3,
                StreamSelection {
                    video: Some(TrackRef {
                        input: 0,
                        stream: 0,
                    }),
                    audio: streams.audio,
                }
            ),
            Err(Error::InvalidStreams)
        );
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn probe_uses_an_explicit_demuxer_for_idgpart_outputs() {
        let output = Path::new("C:\\isolated\\media.idgpart");
        for (format, demuxer) in [
            (OutputFormat::Mp4, "mp4"),
            (OutputFormat::Matroska, "matroska"),
            (OutputFormat::AudioOriginal, "matroska"),
            (OutputFormat::Mp3, "mp3"),
            (OutputFormat::Aac, "aac"),
            (OutputFormat::Flac, "flac"),
        ] {
            let args = ffprobe_args(output, format);
            let values = args
                .iter()
                .map(|arg| arg.to_string_lossy().into_owned())
                .collect::<Vec<_>>();
            assert!(has_pair(&values, "-f", demuxer));
            assert_eq!(args.last(), Some(&output.as_os_str().to_os_string()));
            assert!(has_pair(&values, "-protocol_whitelist", "file"));
        }
    }

    #[test]
    fn rejects_empty_or_out_of_range_input_and_track_references() {
        assert_eq!(resolve_inputs(&[]), Err(Error::InvalidInput));
        assert_eq!(
            resolve_inputs(&vec![PathBuf::from("relative"); MAX_INPUT_FILES + 1]),
            Err(Error::InvalidInput)
        );
        let streams = StreamSelection {
            video: Some(TrackRef {
                input: 2,
                stream: 0,
            }),
            audio: None,
        };
        assert_eq!(
            validate_streams(2, OutputFormat::Mp4, streams),
            Err(Error::InvalidStreams)
        );
    }

    #[test]
    fn malformed_or_empty_probe_output_is_rejected() {
        let streams = StreamSelection {
            video: Some(TrackRef {
                input: 0,
                stream: 0,
            }),
            audio: None,
        };
        assert_eq!(
            parse_probe(b"not json", OutputFormat::Mp4, streams),
            Err(Error::InvalidProbeOutput)
        );
        assert_eq!(
            parse_probe(
                br#"{"format":{"duration":"4.2"},"streams":[]}"#,
                OutputFormat::Mp4,
                streams
            ),
            Err(Error::MissingStreams)
        );
    }

    #[test]
    fn probe_requires_positive_finite_duration_and_requested_streams() {
        let streams = StreamSelection {
            video: Some(TrackRef {
                input: 0,
                stream: 0,
            }),
            audio: Some(TrackRef {
                input: 1,
                stream: 0,
            }),
        };
        assert_eq!(
            parse_probe(
                br#"{"format":{"duration":"NaN"},"streams":[{"codec_type":"video"},{"codec_type":"audio"}]}"#,
                OutputFormat::Mp4,
                streams
            ),
            Err(Error::InvalidDuration)
        );
        assert_eq!(
            parse_probe(
                br#"{"format":{"duration":"4.2"},"streams":[{"codec_type":"video"}]}"#,
                OutputFormat::Mp4,
                streams
            ),
            Err(Error::MissingStreams)
        );
    }

    #[test]
    fn probe_returns_only_verified_duration_and_track_presence() {
        let verified = parse_probe(
            br#"{"format":{"duration":"4.2"},"streams":[{"codec_type":"video"},{"codec_type":"audio"}]}"#,
            OutputFormat::Mp4,
            StreamSelection {
                video: Some(TrackRef {
                    input: 0,
                    stream: 0,
                }),
                audio: Some(TrackRef {
                    input: 1,
                    stream: 0,
                }),
            },
        )
        .unwrap();
        assert_eq!(verified.duration_seconds, 4.2);
        assert!(verified.has_audio && verified.has_video);
    }

    #[test]
    fn audio_outputs_require_audio_and_reject_video_in_ffprobe_results() {
        let audio = StreamSelection {
            video: None,
            audio: Some(TrackRef {
                input: 0,
                stream: 0,
            }),
        };
        let valid_audio = br#"{"format":{"duration":"4.2"},"streams":[{"codec_type":"audio"}]}"#;
        for format in [
            OutputFormat::AudioOriginal,
            OutputFormat::Mp3,
            OutputFormat::Aac,
            OutputFormat::Flac,
        ] {
            assert!(parse_probe(valid_audio, format, audio).is_ok());
            assert_eq!(
                parse_probe(
                    br#"{"format":{"duration":"4.2"},"streams":[{"codec_type":"video"}]}"#,
                    format,
                    audio
                ),
                Err(Error::MissingStreams)
            );
            assert_eq!(
                parse_probe(
                    br#"{"format":{"duration":"4.2"},"streams":[{"codec_type":"audio"},{"codec_type":"video"}]}"#,
                    format,
                    audio
                ),
                Err(Error::MissingStreams)
            );
        }
    }
}
