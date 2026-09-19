use idg_protocol::DownloadError;
#[cfg(windows)]
fn transform(bytes: &[u8], encrypt: bool) -> Result<Vec<u8>, DownloadError> {
    use windows_sys::Win32::{Foundation::LocalFree, Security::Cryptography::*};
    if bytes.len() > u32::MAX as usize {
        return Err(DownloadError::SecretUnavailable);
    }
    let input = CRYPT_INTEGER_BLOB {
        cbData: bytes.len() as u32,
        pbData: bytes.as_ptr() as *mut u8,
    };
    let mut output = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: std::ptr::null_mut(),
    };
    // User scope, UI forbidden. No LOCAL_MACHINE flag, passwords or application key files.
    let ok = unsafe {
        if encrypt {
            CryptProtectData(
                &input,
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        } else {
            CryptUnprotectData(
                &input,
                std::ptr::null_mut(),
                std::ptr::null(),
                std::ptr::null(),
                std::ptr::null(),
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
        }
    };
    if ok == 0 {
        return Err(DownloadError::SecretUnavailable);
    }
    let result =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        std::ptr::write_bytes(output.pbData, 0, output.cbData as usize);
        LocalFree(output.pbData.cast());
    }
    Ok(result)
}
pub fn encrypt(bytes: &[u8]) -> Result<Vec<u8>, DownloadError> {
    #[cfg(windows)]
    {
        transform(bytes, true)
    }
    #[cfg(not(windows))]
    {
        let _ = bytes;
        Err(DownloadError::SecretUnavailable)
    }
}
pub fn decrypt(bytes: &[u8]) -> Result<Vec<u8>, DownloadError> {
    #[cfg(windows)]
    {
        transform(bytes, false)
    }
    #[cfg(not(windows))]
    {
        let _ = bytes;
        Err(DownloadError::SecretUnavailable)
    }
}
