//! Fixed Windows operations. No shell, force flags, elevation, or system policy changes.
use idg_protocol::{DownloadError, PowerAction};
use windows_sys::Win32::{
    Foundation::*,
    Security::*,
    System::{Power::SetSuspendState, Shutdown::*, Threading::*},
};

pub fn request_power(action: &PowerAction, simulated: bool) -> Result<(), DownloadError> {
    if simulated || *action == PowerAction::None {
        return Ok(());
    }
    // The privilege is enabled only on the existing process token, then restored.
    // A policy denying it is an error, never a request to elevate or change that policy.
    unsafe {
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(
            GetCurrentProcess(),
            TOKEN_ADJUST_PRIVILEGES | TOKEN_QUERY,
            &mut token,
        ) == 0
        {
            return Err(DownloadError::AccessDenied);
        }
        let mut luid = LUID::default();
        if LookupPrivilegeValueW(std::ptr::null(), SE_SHUTDOWN_NAME, &mut luid) == 0 {
            CloseHandle(token);
            return Err(DownloadError::AccessDenied);
        }
        let privileges = TOKEN_PRIVILEGES {
            PrivilegeCount: 1,
            Privileges: [LUID_AND_ATTRIBUTES {
                Luid: luid,
                Attributes: SE_PRIVILEGE_ENABLED,
            }],
        };
        let mut previous = TOKEN_PRIVILEGES::default();
        let mut length = 0;
        SetLastError(ERROR_SUCCESS);
        let adjusted = AdjustTokenPrivileges(
            token,
            0,
            &privileges,
            size_of::<TOKEN_PRIVILEGES>() as u32,
            &mut previous,
            &mut length,
        );
        if adjusted == 0 || GetLastError() != ERROR_SUCCESS {
            CloseHandle(token);
            return Err(DownloadError::AccessDenied);
        }
        let accepted = match action {
            PowerAction::Shutdown => {
                ExitWindowsEx(
                    EWX_POWEROFF,
                    SHTDN_REASON_MAJOR_APPLICATION | SHTDN_REASON_FLAG_PLANNED,
                ) != 0
            }
            PowerAction::Suspend => SetSuspendState(false, false, false),
            PowerAction::Hibernate => SetSuspendState(true, false, false),
            PowerAction::None => true,
        };
        AdjustTokenPrivileges(
            token,
            0,
            &previous,
            0,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        );
        CloseHandle(token);
        if accepted {
            Ok(())
        } else {
            Err(DownloadError::AccessDenied)
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn simulation_never_calls_windows_or_changes_privileges() {
        for action in [
            PowerAction::None,
            PowerAction::Shutdown,
            PowerAction::Suspend,
            PowerAction::Hibernate,
        ] {
            assert!(request_power(&action, true).is_ok());
        }
    }
}
