//! Explicit deletion of one completed file, verified through the same exclusive handle.
use idg_protocol::DownloadError;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::Read,
    os::windows::{
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    },
    path::Path,
};
use windows_sys::Win32::{Foundation::GENERIC_READ, Storage::FileSystem::*};
pub fn delete_verified(path: &Path, bytes: u64, hash: &str) -> Result<(), DownloadError> {
    if !path.is_absolute() || hash.len() != 64 {
        return Err(DownloadError::InvalidInput);
    }
    let mut parents = Vec::<File>::new();
    for parent in path
        .parent()
        .ok_or(DownloadError::InvalidInput)?
        .ancestors()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
    {
        let handle = OpenOptions::new()
            .access_mode(FILE_READ_ATTRIBUTES)
            .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE)
            .custom_flags(FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT)
            .open(parent)
            .map_err(|_| DownloadError::FileIo)?;
        if handle
            .metadata()
            .map_err(|_| DownloadError::FileIo)?
            .file_attributes()
            & FILE_ATTRIBUTE_REPARSE_POINT
            != 0
        {
            return Err(DownloadError::InvalidInput);
        }
        parents.push(handle);
    }
    let mut file = OpenOptions::new()
        .access_mode(GENERIC_READ | DELETE)
        .share_mode(0)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
        .map_err(|_| DownloadError::FileIo)?;
    let metadata = file.metadata().map_err(|_| DownloadError::FileIo)?;
    if !metadata.is_file()
        || metadata.len() != bytes
        || metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    {
        return Err(DownloadError::Conflict);
    }
    let mut digest = Sha256::new();
    let mut buffer = [0u8; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|_| DownloadError::FileIo)?;
        if n == 0 {
            break;
        }
        digest.update(&buffer[..n]);
    }
    if !format!("{:x}", digest.finalize()).eq_ignore_ascii_case(hash) {
        return Err(DownloadError::Conflict);
    }
    let disposition = FILE_DISPOSITION_INFO { DeleteFile: true };
    // Parents cannot be renamed and the verified file cannot be written/replaced while held.
    let accepted = unsafe {
        SetFileInformationByHandle(
            file.as_raw_handle(),
            FileDispositionInfo,
            std::ptr::from_ref(&disposition).cast(),
            size_of::<FILE_DISPOSITION_INFO>() as u32,
        )
    };
    if accepted == 0 {
        return Err(DownloadError::FileIo);
    }
    drop(file);
    drop(parents);
    Ok(())
}
