//! File identity checks and explicit deletion for completed downloads.
use idg_protocol::DownloadError;
use sha2::{Digest, Sha256};
use std::{
    fs::{File, OpenOptions},
    io::Read,
    os::windows::{
        ffi::OsStrExt,
        fs::{MetadataExt, OpenOptionsExt},
        io::AsRawHandle,
    },
    path::{Component, Path},
};
use windows_sys::Win32::{Foundation::GENERIC_READ, Storage::FileSystem::*};

fn safe_local_path(path: &Path) -> bool {
    let mut components = path.components();
    let Some(Component::Prefix(prefix)) = components.next() else {
        return false;
    };
    if !path.is_absolute()
        || !matches!(
            prefix.kind(),
            std::path::Prefix::Disk(_) | std::path::Prefix::VerbatimDisk(_)
        )
        || !matches!(components.next(), Some(Component::RootDir))
    {
        return false;
    }
    let is_reserved = |name: &str| {
        let stem = name
            .split('.')
            .next()
            .unwrap_or_default()
            .trim_end_matches([' ', '.']);
        matches!(
            stem.to_ascii_lowercase().as_str(),
            "con" | "prn" | "aux" | "nul"
        ) || ["com", "lpt"].iter().any(|prefix| {
            stem.len() == 4
                && stem
                    .get(..3)
                    .is_some_and(|part| part.eq_ignore_ascii_case(prefix))
                && matches!(stem.as_bytes()[3], b'1'..=b'9')
        })
    };
    let components_are_safe = components.all(|component| match component {
        Component::Prefix(_) | Component::RootDir => false,
        Component::CurDir | Component::ParentDir => false,
        Component::Normal(part) => {
            let part = part.to_string_lossy();
            !part.contains(':')
                && !part.ends_with([' ', '.'])
                && !part.chars().any(char::is_control)
                && !is_reserved(&part)
        }
    });
    components_are_safe && path.file_name().is_some()
}

fn parent_handles(path: &Path) -> Result<Vec<File>, DownloadError> {
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
    Ok(parents)
}

pub fn watchable_directory(path: &Path) -> bool {
    let candidate = path.join("idg-watch-scope-check.bin");
    path.is_absolute() && safe_local_path(&candidate) && parent_handles(&candidate).is_ok()
}

fn verified_file(
    path: &Path,
    bytes: u64,
    hash: &str,
    access: u32,
) -> Result<(File, Vec<File>), DownloadError> {
    if !safe_local_path(path)
        || hash.len() != 64
        || !hash.bytes().all(|byte| byte.is_ascii_hexdigit())
    {
        return Err(DownloadError::InvalidInput);
    }
    let parents = parent_handles(path)?;
    let mut file = OpenOptions::new()
        .access_mode(access)
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
    Ok((file, parents))
}

pub fn locate_verified(path: &Path, bytes: u64, hash: &str) -> Result<(), DownloadError> {
    let (file, parents) = verified_file(path, bytes, hash, GENERIC_READ)?;
    drop(file);
    drop(parents);
    Ok(())
}

pub fn signature(path: &Path, bytes: u64, hash: &str) -> idg_protocol::FileSecurityInfo {
    use idg_protocol::{FileSecurityInfo, SignatureStatus};
    let Ok((file, parents)) = verified_file(path, bytes, hash, GENERIC_READ) else {
        return FileSecurityInfo {
            status: SignatureStatus::Unavailable,
            publisher: None,
            mark_of_web_present: None,
        };
    };
    let supported = matches!(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("exe" | "dll" | "sys" | "msi" | "cat")
    );
    let mut info = if supported {
        verify_authenticode(path)
    } else {
        FileSecurityInfo {
            status: SignatureStatus::NotApplicable,
            publisher: None,
            mark_of_web_present: None,
        }
    };
    drop(file);
    drop(parents);
    info.mark_of_web_present = mark_of_web_present(path);
    info
}

fn verify_authenticode(path: &Path) -> idg_protocol::FileSecurityInfo {
    use idg_protocol::{FileSecurityInfo, SignatureStatus};
    use windows::{
        Win32::{
            Foundation::HWND,
            Security::WinTrust::{
                WINTRUST_ACTION_GENERIC_VERIFY_V2, WINTRUST_DATA, WINTRUST_DATA_0,
                WINTRUST_FILE_INFO, WTD_CACHE_ONLY_URL_RETRIEVAL, WTD_CHOICE_FILE,
                WTD_REVOKE_WHOLECHAIN, WTD_STATEACTION_CLOSE, WTD_STATEACTION_VERIFY, WTD_UI_NONE,
                WTD_UICONTEXT_EXECUTE, WinVerifyTrust,
            },
        },
        core::PCWSTR,
    };

    let Ok(path) = std::fs::canonicalize(path) else {
        return FileSecurityInfo {
            status: SignatureStatus::Unavailable,
            publisher: None,
            mark_of_web_present: None,
        };
    };
    let mut path_wide = path
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect::<Vec<_>>();
    let mut file = WINTRUST_FILE_INFO {
        cbStruct: std::mem::size_of::<WINTRUST_FILE_INFO>() as u32,
        pcwszFilePath: PCWSTR(path_wide.as_mut_ptr()),
        ..Default::default()
    };
    let mut data = WINTRUST_DATA {
        cbStruct: std::mem::size_of::<WINTRUST_DATA>() as u32,
        dwUIChoice: WTD_UI_NONE,
        fdwRevocationChecks: WTD_REVOKE_WHOLECHAIN,
        dwUnionChoice: WTD_CHOICE_FILE,
        Anonymous: WINTRUST_DATA_0 { pFile: &mut file },
        dwStateAction: WTD_STATEACTION_VERIFY,
        dwProvFlags: WTD_CACHE_ONLY_URL_RETRIEVAL,
        dwUIContext: WTD_UICONTEXT_EXECUTE,
        ..Default::default()
    };
    let mut action = WINTRUST_ACTION_GENERIC_VERIFY_V2;
    let result = unsafe {
        WinVerifyTrust(
            HWND::default(),
            &mut action,
            std::ptr::from_mut(&mut data).cast(),
        )
    };
    let publisher = if result == 0 {
        unsafe { signer_publisher(data.hWVTStateData) }
    } else {
        None
    };
    data.dwStateAction = WTD_STATEACTION_CLOSE;
    unsafe {
        WinVerifyTrust(
            HWND::default(),
            &mut action,
            std::ptr::from_mut(&mut data).cast(),
        );
    }
    let status = signature_status(result);
    FileSecurityInfo {
        status,
        publisher,
        mark_of_web_present: None,
    }
}

fn signature_status(result: i32) -> idg_protocol::SignatureStatus {
    use idg_protocol::SignatureStatus;
    if result == 0 {
        SignatureStatus::Valid
    } else if result as u32 == 0x800b0100 {
        SignatureStatus::Unsigned
    } else if result as u32 == 0x80096010 {
        SignatureStatus::Invalid
    } else {
        SignatureStatus::Unavailable
    }
}

unsafe fn signer_publisher(state: windows::Win32::Foundation::HANDLE) -> Option<String> {
    use windows::Win32::Security::{
        Cryptography::{CERT_NAME_SIMPLE_DISPLAY_TYPE, CertGetNameStringW},
        WinTrust::{
            CRYPT_PROVIDER_CERT, WTHelperGetProvCertFromChain, WTHelperGetProvSignerFromChain,
            WTHelperProvDataFromStateData,
        },
    };
    let provider = unsafe { WTHelperProvDataFromStateData(state) };
    if provider.is_null() {
        return None;
    }
    let signer = unsafe { WTHelperGetProvSignerFromChain(provider, 0, false, 0) };
    if signer.is_null() {
        return None;
    }
    let certificate: *mut CRYPT_PROVIDER_CERT = unsafe { WTHelperGetProvCertFromChain(signer, 0) };
    if certificate.is_null() {
        return None;
    }
    let certificate = unsafe { (*certificate).pCert };
    if certificate.is_null() {
        return None;
    }
    let required =
        unsafe { CertGetNameStringW(certificate, CERT_NAME_SIMPLE_DISPLAY_TYPE, 0, None, None) }
            as usize;
    if !(2..=512).contains(&required) {
        return None;
    }
    let mut name = vec![0u16; required];
    let written = unsafe {
        CertGetNameStringW(
            certificate,
            CERT_NAME_SIMPLE_DISPLAY_TYPE,
            0,
            None,
            Some(&mut name),
        )
    } as usize;
    if written < 2 {
        return None;
    }
    let length = name
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(written)
        .min(name.len());
    let result = String::from_utf16(&name[..length]).ok()?;
    (!result.trim().is_empty()).then_some(result)
}

pub fn apply_attachment_mark(
    path: &Path,
    source_origin: Option<&str>,
) -> Result<(), DownloadError> {
    use windows::{
        Win32::{
            System::Com::{
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
                CoUninitialize,
            },
            UI::Shell::{AttachmentServices, IAttachmentExecute},
        },
        core::PCWSTR,
    };
    if !safe_local_path(path) || !path.is_file() {
        return Err(DownloadError::InvalidInput);
    }
    let path = path.to_path_buf();
    let source = source_origin.map(str::to_owned);
    std::thread::Builder::new()
        .name("idg-attachment-policy".into())
        .spawn(move || {
            let initialized = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
            if initialized.is_err() {
                return Err(DownloadError::FileIo);
            }
            let result = (|| {
                let service: IAttachmentExecute =
                    unsafe { CoCreateInstance(&AttachmentServices, None, CLSCTX_INPROC_SERVER) }
                        .map_err(|_| DownloadError::FileIo)?;
                let local = path
                    .as_os_str()
                    .encode_wide()
                    .chain(Some(0))
                    .collect::<Vec<_>>();
                let name = path.file_name().ok_or(DownloadError::InvalidInput)?;
                let name = name.encode_wide().chain(Some(0)).collect::<Vec<_>>();
                let source =
                    source.map(|value| value.encode_utf16().chain(Some(0)).collect::<Vec<_>>());
                unsafe {
                    service
                        .SetClientGuid(&windows::core::GUID::from_u128(
                            0xd6e8e3b4_6d4a_4e13_9c2f_3dd949b5c36e,
                        ))
                        .map_err(|_| DownloadError::FileIo)?;
                    service
                        .SetLocalPath(PCWSTR(local.as_ptr()))
                        .map_err(|_| DownloadError::FileIo)?;
                    service
                        .SetFileName(PCWSTR(name.as_ptr()))
                        .map_err(|_| DownloadError::FileIo)?;
                    if let Some(source) = source.as_ref() {
                        service
                            .SetSource(PCWSTR(source.as_ptr()))
                            .map_err(|_| DownloadError::FileIo)?;
                    }
                    service.CheckPolicy().map_err(|_| DownloadError::FileIo)?;
                    service.Save().map_err(|_| DownloadError::FileIo)?;
                }
                Ok(())
            })();
            unsafe { CoUninitialize() };
            result
        })
        .map_err(|_| DownloadError::FileIo)?
        .join()
        .map_err(|_| DownloadError::FileIo)?
}

pub fn mark_of_web_present(path: &Path) -> Option<bool> {
    use std::{ffi::OsString, io::Read, os::windows::ffi::OsStringExt};
    if !safe_local_path(path) {
        return None;
    }
    let mut stream = path.as_os_str().encode_wide().collect::<Vec<_>>();
    stream.extend(":Zone.Identifier".encode_utf16());
    let mut file = match File::open(Path::new(&OsString::from_wide(&stream))) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Some(false),
        Err(_) => return None,
    };
    let mut contents = String::new();
    if file
        .by_ref()
        .take(2048)
        .read_to_string(&mut contents)
        .is_err()
    {
        return None;
    }
    let zone_transfer = contents.lines().any(|line| line.trim() == "[ZoneTransfer]");
    let zone_id = contents.lines().any(|line| {
        line.trim()
            .strip_prefix("ZoneId=")
            .is_some_and(|value| matches!(value, "0" | "1" | "2" | "3" | "4"))
    });
    Some(zone_transfer && zone_id)
}

pub fn presence(path: &Path) -> idg_protocol::FilePresence {
    use idg_protocol::FilePresence;
    if !safe_local_path(path) {
        return FilePresence::Unknown;
    }
    let parents = match parent_handles(path) {
        Ok(handles) => handles,
        Err(DownloadError::FileIo) => return FilePresence::Unknown,
        Err(_) => return FilePresence::Inaccessible,
    };
    let file = match OpenOptions::new()
        .access_mode(FILE_READ_ATTRIBUTES)
        .share_mode(FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE)
        .custom_flags(FILE_FLAG_OPEN_REPARSE_POINT)
        .open(path)
    {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            drop(parents);
            return FilePresence::Missing;
        }
        Err(error) if error.kind() == std::io::ErrorKind::PermissionDenied => {
            drop(parents);
            return FilePresence::Inaccessible;
        }
        Err(_) => {
            drop(parents);
            return FilePresence::Unknown;
        }
    };
    let result = file.metadata().map_or(FilePresence::Unknown, |metadata| {
        if metadata.is_file() && metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT == 0 {
            FilePresence::Available
        } else {
            FilePresence::Inaccessible
        }
    });
    drop(file);
    drop(parents);
    result
}

pub fn delete_verified(path: &Path, bytes: u64, hash: &str) -> Result<(), DownloadError> {
    let (file, parents) = verified_file(path, bytes, hash, GENERIC_READ | DELETE)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn locate_checks_size_hash_and_reports_only_observed_path_state() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("known.bin");
        let content = b"phase-12 fixture bytes";
        std::fs::File::create(&path)
            .unwrap()
            .write_all(content)
            .unwrap();
        let hash = format!("{:x}", Sha256::digest(content));
        assert_eq!(presence(&path), idg_protocol::FilePresence::Available);
        assert_eq!(locate_verified(&path, content.len() as u64, &hash), Ok(()));
        let extended = std::fs::canonicalize(&path).unwrap();
        assert!(extended.to_string_lossy().starts_with(r"\\?\"));
        assert_eq!(presence(&extended), idg_protocol::FilePresence::Available);
        assert_eq!(
            locate_verified(&extended, content.len() as u64, &hash),
            Ok(())
        );
        assert!(!safe_local_path(Path::new(r"\\server\share\file.bin")));
        assert!(!safe_local_path(Path::new(
            r"\\?\UNC\server\share\file.bin"
        )));
        assert!(!safe_local_path(Path::new(r"\\.\PhysicalDrive0")));
        assert_eq!(
            locate_verified(&path, content.len() as u64 + 1, &hash),
            Err(DownloadError::Conflict)
        );
        assert_eq!(
            locate_verified(&path, content.len() as u64, &"0".repeat(64)),
            Err(DownloadError::Conflict)
        );
        let missing = dir.path().join("not-present.bin");
        assert_eq!(presence(&missing), idg_protocol::FilePresence::Missing);
        assert_eq!(
            presence(&dir.path().join("unavailable-volume").join("file.bin")),
            idg_protocol::FilePresence::Unknown
        );
        assert_eq!(
            locate_verified(&dir.path().join("..").join("escape.bin"), 0, &hash),
            Err(DownloadError::InvalidInput)
        );
        assert_eq!(
            locate_verified(&dir.path().join("stream:secret.bin"), 0, &hash),
            Err(DownloadError::InvalidInput)
        );
    }

    #[test]
    fn a_share_locked_file_is_visible_but_cannot_be_verified_for_reassociation() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("locked.bin");
        let content = b"owned fixture";
        std::fs::write(&path, content).unwrap();
        let locked = OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert_eq!(presence(&path), idg_protocol::FilePresence::Available);
        assert_eq!(
            locate_verified(
                &path,
                content.len() as u64,
                &format!("{:x}", Sha256::digest(content)),
            ),
            Err(DownloadError::FileIo)
        );
        drop(locked);
        assert_eq!(
            locate_verified(
                &path,
                content.len() as u64,
                &format!("{:x}", Sha256::digest(content)),
            ),
            Ok(())
        );
    }

    #[test]
    fn signature_states_distinguish_absent_invalid_and_unverifiable() {
        use idg_protocol::SignatureStatus::*;
        assert_eq!(signature_status(0), Valid);
        assert_eq!(signature_status(0x800b0100_u32 as i32), Unsigned);
        assert_eq!(signature_status(0x80096010_u32 as i32), Invalid);
        assert_eq!(signature_status(0x800b0003_u32 as i32), Unavailable);
        assert_eq!(signature_status(0x800b010e_u32 as i32), Unavailable);
    }

    #[test]
    fn security_inspection_checks_identity_and_reads_a_zone_identifier() {
        use std::{ffi::OsString, os::windows::ffi::OsStringExt};
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("fixture.bin");
        let content = b"fixture only";
        std::fs::write(&path, content).unwrap();
        let hash = format!("{:x}", Sha256::digest(content));
        let info = signature(&path, content.len() as u64, &hash);
        assert_eq!(info.status, idg_protocol::SignatureStatus::NotApplicable);
        assert_eq!(info.mark_of_web_present, Some(false));

        let mut stream = path.as_os_str().encode_wide().collect::<Vec<_>>();
        stream.extend(":Zone.Identifier".encode_utf16());
        std::fs::write(
            Path::new(&OsString::from_wide(&stream)),
            "[ZoneTransfer]\r\nZoneId=3\r\n",
        )
        .unwrap();
        assert_eq!(mark_of_web_present(&path), Some(true));
        assert_eq!(
            signature(&path, content.len() as u64 + 1, &hash).status,
            idg_protocol::SignatureStatus::Unavailable
        );
    }
}
