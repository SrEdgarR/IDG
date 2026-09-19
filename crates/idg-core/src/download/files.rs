use super::*;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

pub fn validate_input(input: &NewDownload) -> Result<(), DownloadError> {
    let url = reqwest::Url::parse(&input.url).map_err(|_| DownloadError::InvalidInput)?;
    let n = &input.name;
    let stem = n.split('.').next().unwrap_or("").to_ascii_uppercase();
    if !matches!(url.scheme(), "http" | "https")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || input.url.len() > 8192
        || n.is_empty()
        || n.len() > 240
        || n.chars()
            .any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || n.ends_with(['.', ' '])
        || matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit())
        || !Path::new(&input.directory).is_absolute()
        || input.directory.starts_with("\\\\")
        || input
            .expected_sha256
            .as_ref()
            .is_some_and(|h| h.len() != 64 || !h.bytes().all(|b| b.is_ascii_hexdigit()))
    {
        return Err(DownloadError::InvalidInput);
    }
    Ok(())
}
fn ordinary(path: &Path) -> Result<(), DownloadError> {
    for parent in path.ancestors() {
        if let Ok(m) = std::fs::symlink_metadata(parent) {
            if m.file_type().is_symlink() {
                return Err(DownloadError::InvalidInput);
            }
            #[cfg(windows)]
            {
                use std::os::windows::fs::MetadataExt;
                if m.file_attributes() & 0x400 != 0 {
                    return Err(DownloadError::InvalidInput);
                }
            }
        }
    }
    Ok(())
}
pub fn create_job(id: &str, input: NewDownload) -> Result<Job, DownloadError> {
    validate_input(&input)?;
    if id.is_empty()
        || id.len() > 64
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err(DownloadError::InvalidInput);
    }
    ordinary(Path::new(&input.directory))?;
    let directory = std::fs::canonicalize(&input.directory).map_err(file_error)?;
    let mut final_path = directory.join(&input.name);
    ordinary(&final_path)?;
    if final_path.exists() {
        match input.conflict {
            ConflictPolicy::Reject => return Err(DownloadError::Conflict),
            ConflictPolicy::Rename => {
                final_path = alternative(&directory, &input.name)?;
            }
            ConflictPolicy::Replace => {
                if !final_path.is_file() {
                    return Err(DownloadError::Conflict);
                }
            }
        }
    }
    let mut temporary = PathBuf::from(format!("{}.idgpart", final_path.to_string_lossy()));
    if temporary.exists() {
        temporary = PathBuf::from(format!("{}.idgpart.{id}", final_path.to_string_lossy()));
    }
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temporary)
        .map_err(file_error)?;
    file.sync_all().map_err(file_error)?;
    Ok(Job {
        id: id.into(),
        input,
        final_path: final_path.to_string_lossy().into(),
        temporary: temporary.to_string_lossy().into(),
        effective_url: None,
        etag: None,
        last_modified: None,
        total: None,
        received: 0,
        durable: 0,
        prefix_sha256: format!("{:x}", Sha256::digest([])),
        calculated_sha256: None,
        verified: false,
        state: TransferState::Probing,
        error: None,
        range_confirmed: false,
        retry_after_seconds: None,
        retry_not_before: None,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs(),
    })
}
fn alternative(directory: &Path, name: &str) -> Result<PathBuf, DownloadError> {
    let p = Path::new(name);
    let stem = p.file_stem().unwrap_or_default().to_string_lossy();
    let ext = p
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for i in 1..=9999 {
        let candidate = directory.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err(DownloadError::Conflict)
}
pub(super) fn open_partial(job: &Job) -> Result<(File, Sha256), DownloadError> {
    ordinary(Path::new(&job.temporary))?;
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0).custom_flags(0x00200000);
    }
    let mut file = options.open(&job.temporary).map_err(file_error)?;
    if !file.metadata().map_err(file_error)?.is_file()
        || file.metadata().map_err(file_error)?.len() < job.durable
    {
        return Err(DownloadError::PartialChanged);
    }
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 65536];
    let mut remaining = job.durable;
    while remaining > 0 {
        let count = file
            .read(&mut buffer[..remaining.min(65536) as usize])
            .map_err(file_error)?;
        if count == 0 {
            return Err(DownloadError::PartialChanged);
        }
        hash.update(&buffer[..count]);
        remaining -= count as u64;
    }
    if format!("{:x}", hash.clone().finalize()) != job.prefix_sha256 {
        return Err(DownloadError::PartialChanged);
    }
    file.set_len(job.durable).map_err(file_error)?;
    file.seek(SeekFrom::Start(job.durable))
        .map_err(file_error)?;
    Ok((file, hash))
}
pub fn recover(job: &mut Job) {
    job.received = job.durable;
    if matches!(
        job.state,
        TransferState::Probing | TransferState::Downloading
    ) {
        job.state = TransferState::Paused;
    }
    if matches!(job.state, TransferState::Verifying) {
        job.state = TransferState::PublishPending;
    }
}
pub(super) fn publish(job: &mut Job, store: &mut dyn Checkpoint) -> Result<(), DownloadError> {
    ordinary(Path::new(&job.final_path))?;
    if Path::new(&job.final_path).exists() && job.input.conflict == ConflictPolicy::Rename {
        job.final_path = alternative(
            Path::new(&job.final_path)
                .parent()
                .ok_or(DownloadError::InvalidInput)?,
            &job.input.name,
        )?
        .to_string_lossy()
        .into();
        store.save(job)?;
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
        }
        let from: Vec<u16> = std::ffi::OsStr::new(&job.temporary)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let to: Vec<u16> = std::ffi::OsStr::new(&job.final_path)
            .encode_wide()
            .chain(Some(0))
            .collect();
        let flags = 8 | if job.input.conflict == ConflictPolicy::Replace {
            1
        } else {
            0
        };
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), flags) } == 0 {
            return Err(DownloadError::PublishBlocked);
        }
    }
    #[cfg(not(windows))]
    {
        if job.input.conflict == ConflictPolicy::Replace {
            std::fs::rename(&job.temporary, &job.final_path)
                .map_err(|_| DownloadError::PublishBlocked)?;
        } else {
            std::fs::hard_link(&job.temporary, &job.final_path)
                .map_err(|_| DownloadError::PublishBlocked)?;
            std::fs::remove_file(&job.temporary).map_err(file_error)?;
        }
        File::open(
            Path::new(&job.final_path)
                .parent()
                .ok_or(DownloadError::InvalidInput)?,
        )
        .and_then(|f| f.sync_all())
        .map_err(file_error)?;
    }
    Ok(())
}

pub(super) fn recover_published(
    job: &mut Job,
    store: &mut dyn Checkpoint,
) -> Result<(), DownloadError> {
    ordinary(Path::new(&job.final_path))?;
    let mut file = File::open(&job.final_path).map_err(file_error)?;
    if file.metadata().map_err(file_error)?.len() != job.durable {
        return Err(DownloadError::PartialChanged);
    }
    let mut h = Sha256::new();
    let mut b = [0u8; 65536];
    loop {
        let n = file.read(&mut b).map_err(file_error)?;
        if n == 0 {
            break;
        }
        h.update(&b[..n]);
    }
    if job.calculated_sha256.as_deref() != Some(format!("{:x}", h.finalize()).as_str()) {
        return Err(DownloadError::PartialChanged);
    }
    job.state = TransferState::Completed;
    job.error = None;
    if let Err(error) = store.save(job) {
        job.state = TransferState::PublishPending;
        return Err(error);
    }
    Ok(())
}
