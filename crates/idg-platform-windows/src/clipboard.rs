//! Read only after explicit opt-in. Development fixture never touches the user's clipboard.
use windows_sys::Win32::System::{DataExchange::*, Memory::*};
#[cfg(debug_assertions)]
fn fixture() -> Option<std::path::PathBuf> {
    std::env::var_os("IDG_CLIPBOARD_FIXTURE").map(Into::into)
}
pub fn sequence() -> u32 {
    #[cfg(debug_assertions)]
    if let Some(path) = fixture() {
        return std::fs::metadata(path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|t| t.as_nanos() as u32)
            .unwrap_or(0);
    }
    unsafe { GetClipboardSequenceNumber() }
}
pub fn read_text() -> Option<String> {
    #[cfg(debug_assertions)]
    if let Some(path) = fixture() {
        use std::io::Read;
        let mut bytes = Vec::new();
        std::fs::File::open(path)
            .ok()?
            .take(65537)
            .read_to_end(&mut bytes)
            .ok()?;
        if bytes.len() > 65536 {
            return None;
        }
        return String::from_utf8(bytes).ok();
    }
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }
        let result = (|| {
            // CF_UNICODETEXT = 13, as defined by the Windows SDK. No other formats are read.
            let handle = GetClipboardData(13);
            if handle.is_null() {
                return None;
            }
            let size = GlobalSize(handle);
            if size == 0 || size > 65536 || !size.is_multiple_of(2) {
                return None;
            }
            let data = GlobalLock(handle).cast::<u16>();
            if data.is_null() {
                return None;
            }
            let units = std::slice::from_raw_parts(data, size / 2);
            let result = units
                .iter()
                .position(|u| *u == 0)
                .and_then(|end| String::from_utf16(&units[..end]).ok());
            GlobalUnlock(handle);
            result
        })();
        CloseClipboard();
        result
    }
}
