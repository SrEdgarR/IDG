use idg_protocol::{Command, IO_TIMEOUT, Payload, Request, Response, VERSION, read_frame, send};
use std::{ffi::c_void, io, os::windows::io::AsRawHandle, path::PathBuf, ptr};
use tokio::net::windows::named_pipe::{
    ClientOptions, NamedPipeClient, NamedPipeServer, ServerOptions,
};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE, LocalFree},
    Security::{
        Authorization::{
            ConvertSidToStringSidW, ConvertStringSecurityDescriptorToSecurityDescriptorW,
        },
        GetTokenInformation, SECURITY_ATTRIBUTES, TOKEN_QUERY, TOKEN_USER, TokenUser,
    },
    System::{
        Pipes::{GetNamedPipeClientProcessId, GetNamedPipeServerProcessId},
        Threading::{
            GetCurrentProcess, OpenProcess, OpenProcessToken, PROCESS_QUERY_LIMITED_INFORMATION,
            QueryFullProcessImageNameW,
        },
    },
};

struct Handle(HANDLE);
impl Drop for Handle {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}

fn checked(value: i32) -> io::Result<()> {
    if value == 0 {
        Err(io::Error::last_os_error())
    } else {
        Ok(())
    }
}

fn sid_for_process(process: HANDLE) -> io::Result<String> {
    unsafe {
        let mut token = ptr::null_mut();
        checked(OpenProcessToken(process, TOKEN_QUERY, &mut token))?;
        let token = Handle(token);
        let mut size = 0;
        GetTokenInformation(token.0, TokenUser, ptr::null_mut(), 0, &mut size);
        if size == 0 || size > 65536 {
            return Err(io::Error::other("token size"));
        }
        // usize allocation gives TOKEN_USER alignment; buffer lives through SID conversion.
        let mut storage = vec![0usize; (size as usize).div_ceil(size_of::<usize>())];
        checked(GetTokenInformation(
            token.0,
            TokenUser,
            storage.as_mut_ptr().cast(),
            size,
            &mut size,
        ))?;
        let user = &*(storage.as_ptr().cast::<TOKEN_USER>());
        let mut text = ptr::null_mut();
        checked(ConvertSidToStringSidW(user.User.Sid, &mut text))?;
        let mut length = 0;
        while *text.add(length) != 0 {
            length += 1;
        }
        let result = String::from_utf16_lossy(std::slice::from_raw_parts(text, length));
        LocalFree(text.cast());
        Ok(result)
    }
}

pub fn current_sid() -> io::Result<String> {
    sid_for_process(unsafe { GetCurrentProcess() })
}
pub fn pipe_name() -> io::Result<String> {
    Ok(format!(r"\\.\pipe\IDG.dev.v1.{}", current_sid()?))
}

pub fn sibling(name: &str) -> io::Result<PathBuf> {
    Ok(std::env::current_exe()?
        .parent()
        .ok_or_else(|| io::Error::other("executable directory"))?
        .join(name))
}

/// A protected DACL grants this user only; remote pipe clients are refused by Windows.
/// The first-instance flag fails closed if any process already owns the endpoint.
pub fn listener(first: bool) -> io::Result<NamedPipeServer> {
    let name = pipe_name()?;
    let sddl: Vec<u16> = format!("D:P(A;;GA;;;{})", current_sid()?)
        .encode_utf16()
        .chain(Some(0))
        .collect();
    unsafe {
        let mut descriptor = ptr::null_mut();
        checked(ConvertStringSecurityDescriptorToSecurityDescriptorW(
            sddl.as_ptr(),
            1,
            &mut descriptor,
            ptr::null_mut(),
        ))?;
        let mut attributes = SECURITY_ATTRIBUTES {
            nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: descriptor,
            bInheritHandle: 0,
        };
        let result = ServerOptions::new()
            .first_pipe_instance(first)
            .reject_remote_clients(true)
            .in_buffer_size(4096)
            .out_buffer_size(4096)
            .max_instances(32)
            .create_with_security_attributes_raw(
                name,
                (&mut attributes as *mut SECURITY_ATTRIBUTES).cast::<c_void>(),
            );
        LocalFree(descriptor);
        result
    }
}

fn verify_process(pid: u32, allowed: &[&str]) -> io::Result<()> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return Err(io::Error::last_os_error());
        }
        let handle = Handle(handle);
        if sid_for_process(handle.0)? != current_sid()? {
            return Err(io::Error::from(io::ErrorKind::PermissionDenied));
        }
        let mut path = vec![0u16; 32768];
        let mut size = path.len() as u32;
        checked(QueryFullProcessImageNameW(
            handle.0,
            0,
            path.as_mut_ptr(),
            &mut size,
        ))?;
        let actual =
            PathBuf::from(String::from_utf16_lossy(&path[..size as usize])).canonicalize()?;
        for name in allowed {
            if let Ok(expected) = sibling(name)?.canonicalize()
                && actual == expected
            {
                return Ok(());
            }
        }
        Err(io::Error::from(io::ErrorKind::PermissionDenied))
    }
}

pub fn verify_client(pipe: &NamedPipeServer) -> io::Result<()> {
    let mut pid = 0;
    checked(unsafe { GetNamedPipeClientProcessId(pipe.as_raw_handle(), &mut pid) })?;
    verify_process(
        pid,
        &["idg-desktop.exe", "idg-native-host.exe", "idg-probe.exe"],
    )
}
pub fn is_development_probe(pipe: &NamedPipeServer) -> bool {
    let mut pid = 0;
    if checked(unsafe { GetNamedPipeClientProcessId(pipe.as_raw_handle(), &mut pid) }).is_err() {
        return false;
    }
    verify_process(pid, &["idg-probe.exe"]).is_ok()
}

pub async fn connect() -> io::Result<NamedPipeClient> {
    let name = pipe_name()?;
    let pipe = tokio::time::timeout(IO_TIMEOUT, async {
        loop {
            match ClientOptions::new().open(&name) {
                Ok(pipe) => break Ok(pipe),
                Err(e) if e.raw_os_error() == Some(231) => {
                    tokio::time::sleep(std::time::Duration::from_millis(25)).await
                }
                Err(e) => break Err(e),
            }
        }
    })
    .await
    .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))??;
    let mut pid = 0;
    checked(unsafe { GetNamedPipeServerProcessId(pipe.as_raw_handle(), &mut pid) })?;
    verify_process(pid, &["idg-runtime.exe"])?;
    Ok(pipe)
}

pub async fn exchange(
    pipe: &mut NamedPipeClient,
    command: Command,
    id: &str,
) -> io::Result<Response> {
    send(
        pipe,
        &Request {
            version: VERSION,
            id: id.into(),
            command,
        },
    )
    .await?;
    let bytes = tokio::time::timeout(IO_TIMEOUT, read_frame(pipe))
        .await
        .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))??
        .ok_or_else(|| io::Error::from(io::ErrorKind::UnexpectedEof))?;
    let response: Response = serde_json::from_slice(&bytes).map_err(io::Error::other)?;
    if response.version != VERSION || response.id != id {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "response correlation",
        ));
    }
    if matches!(response.payload, Payload::Error { .. }) {
        return Err(io::Error::other("runtime rejected request"));
    }
    Ok(response)
}
