use super::*;
use sha2::{Digest, Sha256};
use std::{
    future::Future,
    net::SocketAddr,
    time::{Duration, Instant},
};
use suppaftp::{
    FtpError, Mode, Status,
    tokio::{
        AsyncFtpStream, AsyncRustlsConnector, AsyncRustlsFtpStream, ImplAsyncFtpStream,
        TokioTlsStream,
    },
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    sync::watch,
};

const CONNECT_TIMEOUT: Duration = Duration::from_secs(15);
const COMMAND_TIMEOUT: Duration = Duration::from_secs(20);

enum CommandError {
    Interrupted,
    Timeout,
    Ftp(FtpError),
}

fn map_command_error(error: CommandError) -> DownloadError {
    match error {
        CommandError::Interrupted => DownloadError::InvalidState,
        CommandError::Timeout => DownloadError::Timeout,
        CommandError::Ftp(error) => map_error(error),
    }
}

async fn command<T>(
    control: &mut watch::Receiver<Control>,
    future: impl Future<Output = Result<T, FtpError>>,
) -> Result<T, CommandError> {
    if *control.borrow() != Control::Run {
        return Err(CommandError::Interrupted);
    }
    let timeout = tokio::time::timeout(COMMAND_TIMEOUT, future);
    tokio::pin!(timeout);
    loop {
        tokio::select! {
            result = &mut timeout => {
                return result
                    .map_err(|_| CommandError::Timeout)?
                    .map_err(CommandError::Ftp);
            }
            changed = control.changed() => {
                if changed.is_err() || *control.borrow() != Control::Run {
                    return Err(CommandError::Interrupted);
                }
            }
        }
    }
}

fn map_error(error: FtpError) -> DownloadError {
    match error {
        FtpError::UnexpectedResponse(response)
            if matches!(
                response.status,
                Status::InvalidCredentials | Status::NotLoggedIn | Status::LoginNeedAccount
            ) =>
        {
            DownloadError::AccessDenied
        }
        FtpError::UnexpectedResponse(response) if response.status == Status::FileUnavailable => {
            DownloadError::Expired
        }
        FtpError::SecureError(_) => DownloadError::Tls,
        FtpError::ConnectionError(error) if error.kind() == std::io::ErrorKind::TimedOut => {
            DownloadError::Timeout
        }
        FtpError::ConnectionError(_) | FtpError::BadResponse | FtpError::InvalidAddress(_) => {
            DownloadError::Network
        }
        FtpError::UnexpectedResponse(_) | FtpError::DataConnectionAlreadyOpen => {
            DownloadError::Network
        }
    }
}

fn remote_path(url: &reqwest::Url) -> Result<String, DownloadError> {
    let encoded = url.path().as_bytes();
    if encoded.is_empty() || encoded == b"/" || encoded.len() > 4096 {
        return Err(DownloadError::InvalidInput);
    }
    let mut decoded = Vec::with_capacity(encoded.len());
    let mut index = 0;
    while index < encoded.len() {
        if encoded[index] == b'%' {
            let pair = encoded
                .get(index + 1..index + 3)
                .ok_or(DownloadError::InvalidInput)?;
            let hex = std::str::from_utf8(pair).map_err(|_| DownloadError::InvalidInput)?;
            decoded.push(u8::from_str_radix(hex, 16).map_err(|_| DownloadError::InvalidInput)?);
            index += 3;
        } else {
            decoded.push(encoded[index]);
            index += 1;
        }
    }
    let decoded = String::from_utf8(decoded).map_err(|_| DownloadError::InvalidInput)?;
    if decoded.is_empty() || decoded.chars().any(char::is_control) {
        return Err(DownloadError::InvalidInput);
    }
    Ok(decoded)
}

fn tls_config() -> std::sync::Arc<suppaftp::rustls::ClientConfig> {
    let roots =
        suppaftp::rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    std::sync::Arc::new(
        suppaftp::rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth(),
    )
}

fn optional_metadata_error(error: &FtpError) -> bool {
    matches!(
        error,
        FtpError::UnexpectedResponse(response)
            if matches!(response.status, Status::CommandNotImplemented | Status::NotImplemented | Status::NotImplementedParameter)
    )
}

async fn transfer_connected<T: TokioTlsStream + Send>(
    ftp: &mut ImplAsyncFtpStream<T>,
    url: &reqwest::Url,
    path: &str,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: std::sync::Arc<resources::Resources>,
) -> Result<(), DownloadError> {
    ftp.set_mode(Mode::ExtendedPassive);
    let (username, password) = match &job.input.auth {
        Some(auth) => (
            auth.username
                .as_deref()
                .ok_or(DownloadError::InvalidInput)?,
            auth.password.as_deref().unwrap_or(""),
        ),
        None => ("anonymous", "anonymous@"),
    };
    command(control, ftp.login(username, password))
        .await
        .map_err(map_command_error)?;
    command(
        control,
        ftp.transfer_type(suppaftp::types::FileType::Binary),
    )
    .await
    .map_err(map_command_error)?;

    let size = match command(control, ftp.size(path)).await {
        Ok(size) => Some(u64::try_from(size).map_err(|_| DownloadError::SizeMismatch)?),
        Err(CommandError::Ftp(error)) if optional_metadata_error(&error) => None,
        Err(error) => return Err(map_command_error(error)),
    };
    let modified = match command(control, ftp.mdtm(path)).await {
        Ok(time) => Some(time.to_string()),
        Err(CommandError::Ftp(error)) if optional_metadata_error(&error) => None,
        Err(error) => return Err(map_command_error(error)),
    };
    let validator = size
        .zip(modified.as_ref())
        .map(|(size, modified)| format!("ftp:{size}:{modified}"));
    if job.durable > 0 {
        if job.input.expected_sha256.is_none() {
            // SIZE + MDTM are useful change detectors, but not a strong identity.
            // Without a caller-provided full-file hash, restart from byte zero.
            job.durable = 0;
            job.received = 0;
            job.prefix_sha256 = format!("{:x}", Sha256::new().finalize());
            job.total = size;
            job.etag = None;
            job.last_modified = None;
            job.effective_url = Some(url.to_string());
            store.save(job)?;
        } else {
            if job.etag.is_none() || validator.as_ref() != job.etag.as_ref() {
                return Err(if validator.is_some() {
                    DownloadError::ResourceChanged
                } else {
                    DownloadError::UnsafeResume
                });
            }
            let offset = usize::try_from(job.durable).map_err(|_| DownloadError::UnsafeResume)?;
            command(control, ftp.resume_transfer(offset))
                .await
                .map_err(|error| match error {
                    CommandError::Ftp(_) => DownloadError::UnsafeResume,
                    other => map_command_error(other),
                })?;
        }
    } else {
        job.total = size;
        job.etag = job.input.expected_sha256.as_ref().and(validator);
        job.last_modified = job.input.expected_sha256.as_ref().and(modified);
        job.effective_url = Some(url.to_string());
        store.save(job)?;
    }

    let (partial, mut hash) = files::open_partial(job)?;
    let mut partial = tokio::fs::File::from_std(partial);
    job.received = job.durable;
    job.target_requests = 1;
    job.active_requests = 1;
    job.strategy = "ftp-sequential".into();
    job.state = TransferState::Downloading;
    job.error = None;
    store.save(job)?;

    let mut stream = Some(
        command(control, ftp.retr_as_stream(path))
            .await
            .map_err(map_command_error)?,
    );
    let mut buffer = [0u8; 65536];
    let mut last_checkpoint = Instant::now();
    let transfer = async {
        loop {
            if *control.borrow() != Control::Run {
                return Err(DownloadError::InvalidState);
            }
            let read = tokio::select! {
                result = tokio::time::timeout(COMMAND_TIMEOUT, stream.as_mut().expect("stream remains open").read(&mut buffer)) => {
                    result.map_err(|_| DownloadError::Timeout)?.map_err(|_| DownloadError::Network)?
                }
                changed = control.changed() => {
                    if changed.is_err() || *control.borrow() != Control::Run {
                        return Err(DownloadError::InvalidState);
                    }
                    continue;
                }
            };
            if read == 0 {
                break;
            }
            let bytes = &buffer[..read];
            budget
                .pace(&job.id, job.options.bytes_per_second, bytes.len(), control)
                .await?;
            let next = job
                .received
                .checked_add(bytes.len() as u64)
                .ok_or(DownloadError::SizeMismatch)?;
            if job.total.is_some_and(|total| next > total) {
                return Err(DownloadError::SizeMismatch);
            }
            partial.write_all(bytes).await.map_err(file_error)?;
            hash.update(bytes);
            job.transferred = job.transferred.saturating_add(bytes.len() as u64);
            job.received = next;
            if job.received - job.durable >= 1024 * 1024
                || last_checkpoint.elapsed() >= Duration::from_secs(1)
            {
                http::checkpoint(&mut partial, job, &hash, store).await?;
                last_checkpoint = Instant::now();
            }
            store.progress(job);
        }
        http::checkpoint(&mut partial, job, &hash, store).await?;
        if *control.borrow() != Control::Run {
            return Err(DownloadError::InvalidState);
        }
        let finish = tokio::time::timeout(COMMAND_TIMEOUT, stream.take().expect("stream remains open").finish());
        tokio::pin!(finish);
        tokio::select! {
            result = &mut finish => result.map_err(|_| DownloadError::Timeout)?.map_err(map_error)?,
            changed = control.changed() => {
                if changed.is_err() || *control.borrow() != Control::Run {
                    return Err(DownloadError::InvalidState);
                }
                return Err(DownloadError::InvalidState);
            }
        }
        Ok(())
    }
    .await;

    if transfer.is_err() || *control.borrow() != Control::Run {
        http::checkpoint(&mut partial, job, &hash, store).await?;
    }
    drop(partial);
    transfer?;
    http::finish(job, store).await
}

pub async fn transfer_managed(
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: std::sync::Arc<resources::Resources>,
) -> Result<(), DownloadError> {
    transfer_managed_with_tls(job, control, store, budget, tls_config()).await
}

async fn transfer_managed_with_tls(
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: std::sync::Arc<resources::Resources>,
    tls: std::sync::Arc<suppaftp::rustls::ClientConfig>,
) -> Result<(), DownloadError> {
    let url = reqwest::Url::parse(&job.input.url).map_err(|_| DownloadError::InvalidInput)?;
    if !matches!(url.scheme(), "ftp" | "ftps")
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
    {
        return Err(DownloadError::InvalidInput);
    }
    if url.scheme() == "ftp" && !job.input.allow_cleartext_ftp {
        return Err(DownloadError::AccessDenied);
    }
    job.options.validate()?;
    if matches!(job.options.mode, RequestMode::Manual { requests } if requests != 1) {
        return Err(DownloadError::InvalidInput);
    }
    if job
        .options
        .proxy
        .as_ref()
        .is_some_and(|policy| !matches!(policy, ProxyPolicy::Direct))
    {
        return Err(DownloadError::ProxyUnsupported);
    }
    if !job.ranges.is_empty() {
        return Err(DownloadError::UnsafeResume);
    }
    if matches!(
        job.state,
        TransferState::PublishPending | TransferState::Verifying
    ) {
        if !std::path::Path::new(&job.temporary).exists() {
            return files::recover_published(job, store);
        }
        let (_file, _hash) = files::open_partial(job)?;
        drop(_file);
        return http::finish(job, store).await;
    }
    if *control.borrow() != Control::Run {
        job.state = if *control.borrow() == Control::Cancel {
            TransferState::Cancelled
        } else {
            TransferState::Paused
        };
        store.save(job)?;
        return Ok(());
    }
    let path = remote_path(&url)?;
    let host = url.host_str().ok_or(DownloadError::InvalidInput)?;
    let port = url.port().unwrap_or(21);
    let origin = url.origin().ascii_serialization();
    let addresses = tokio::time::timeout(CONNECT_TIMEOUT, tokio::net::lookup_host((host, port)))
        .await
        .map_err(|_| DownloadError::Timeout)?
        .map_err(|_| DownloadError::Network)?
        .collect::<Vec<_>>();
    let address: SocketAddr = addresses.into_iter().next().ok_or(DownloadError::Network)?;
    let permit = budget
        .acquire(&job.id, &origin, job.options.priority.clone(), control)
        .await?;
    let result = async {
        if url.scheme() == "ftps" {
            let ftp = tokio::time::timeout(
                CONNECT_TIMEOUT,
                AsyncRustlsFtpStream::connect_timeout(address, CONNECT_TIMEOUT),
            )
            .await
            .map_err(|_| DownloadError::Timeout)?
            .map_err(map_error)?;
            let connector =
                AsyncRustlsConnector::from(suppaftp::tokio_rustls::TlsConnector::from(tls.clone()));
            let mut ftp = tokio::time::timeout(COMMAND_TIMEOUT, ftp.into_secure(connector, host))
                .await
                .map_err(|_| DownloadError::Timeout)?
                .map_err(map_error)?;
            transfer_connected(&mut ftp, &url, &path, job, control, store, budget.clone()).await
        } else {
            let mut ftp = tokio::time::timeout(
                CONNECT_TIMEOUT,
                AsyncFtpStream::connect_timeout(address, CONNECT_TIMEOUT),
            )
            .await
            .map_err(|_| DownloadError::Timeout)?
            .map_err(map_error)?;
            transfer_connected(&mut ftp, &url, &path, job, control, store, budget.clone()).await
        }
    }
    .await;
    drop(permit);
    budget.forget_file(&job.id);
    job.active_requests = 0;
    if result == Err(DownloadError::InvalidState) && *control.borrow() != Control::Run {
        job.received = job.durable;
        job.state = if *control.borrow() == Control::Cancel {
            TransferState::Cancelled
        } else {
            TransferState::Paused
        };
        job.error = None;
        store.save(job)?;
        return Ok(());
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::{
        io::{AsyncBufReadExt, BufReader},
        net::{TcpListener, TcpStream},
        sync::oneshot,
    };

    struct Store;

    impl Checkpoint for Store {
        fn save(&mut self, _: &Job) -> Result<(), DownloadError> {
            Ok(())
        }
    }

    async fn fixture(bytes: Vec<u8>) -> (u16, tokio::task::JoinHandle<Vec<String>>) {
        fixture_with_config(bytes, true, false).await
    }

    async fn fixture_with_config(
        bytes: Vec<u8>,
        rest_supported: bool,
        disconnect_during_data: bool,
    ) -> (u16, tokio::task::JoinHandle<Vec<String>>) {
        let control_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = control_listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (stream, _) = control_listener.accept().await.unwrap();
            serve_recording(
                stream,
                bytes,
                None,
                None,
                rest_supported,
                disconnect_during_data,
            )
            .await
        });
        (port, server)
    }

    async fn delayed_size_fixture(
        bytes: Vec<u8>,
    ) -> (
        u16,
        tokio::task::JoinHandle<Vec<String>>,
        oneshot::Receiver<()>,
        oneshot::Sender<()>,
    ) {
        let control_listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = control_listener.local_addr().unwrap().port();
        let (size_seen_tx, size_seen_rx) = oneshot::channel();
        let (release_size_tx, release_size_rx) = oneshot::channel();
        let server = tokio::spawn(async move {
            let (stream, _) = control_listener.accept().await.unwrap();
            serve_recording(
                stream,
                bytes,
                Some(size_seen_tx),
                Some(release_size_rx),
                true,
                false,
            )
            .await
        });
        (port, server, size_seen_rx, release_size_tx)
    }

    async fn serve_recording(
        stream: TcpStream,
        bytes: Vec<u8>,
        mut size_seen: Option<oneshot::Sender<()>>,
        mut release_size: Option<oneshot::Receiver<()>>,
        rest_supported: bool,
        disconnect_during_data: bool,
    ) -> Vec<String> {
        let mut control = BufReader::new(stream);
        control
            .get_mut()
            .write_all(b"220 IDG local fixture\r\n")
            .await
            .unwrap();
        let mut data_listener = None;
        let mut resume_offset = 0usize;
        let mut commands = Vec::new();
        let mut line = String::new();
        loop {
            line.clear();
            if control.read_line(&mut line).await.unwrap_or(0) == 0 {
                break;
            }
            let mut parts = line.trim_end_matches(['\r', '\n']).splitn(2, ' ');
            let command = parts.next().unwrap_or("").to_ascii_uppercase();
            let argument = parts.next().unwrap_or("");
            commands.push(command.clone());
            let reply = match command.as_str() {
                "USER" if argument == "fixture-user" => "331 Password required\r\n".to_owned(),
                "USER" => "530 Invalid credentials\r\n".to_owned(),
                "PASS" if argument == "fixture-secret" => "230 Logged in\r\n".to_owned(),
                "PASS" => "530 Invalid credentials\r\n".to_owned(),
                "TYPE" => "200 Binary mode\r\n".to_owned(),
                "SIZE" => {
                    if let Some(sender) = size_seen.take() {
                        let _ = sender.send(());
                    }
                    if let Some(receiver) = release_size.take() {
                        let _ = receiver.await;
                    }
                    format!("213 {}\r\n", bytes.len())
                }
                "MDTM" => "213 20260926120000\r\n".to_owned(),
                "REST" if rest_supported => {
                    resume_offset = argument.parse().unwrap();
                    "350 Restart position accepted\r\n".to_owned()
                }
                "REST" => "502 REST not supported\r\n".to_owned(),
                "EPSV" => {
                    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
                    let data_port = listener.local_addr().unwrap().port();
                    data_listener = Some(listener);
                    format!("229 Entering Extended Passive Mode (|||{data_port}|)\r\n")
                }
                "RETR" => {
                    control
                        .get_mut()
                        .write_all(b"150 Opening data connection\r\n")
                        .await
                        .unwrap();
                    let listener = data_listener.take().expect("EPSV precedes RETR");
                    let (mut data, _) = listener.accept().await.unwrap();
                    if disconnect_during_data {
                        data.write_all(&bytes[..bytes.len().min(3)]).await.unwrap();
                        data.shutdown().await.unwrap();
                        break;
                    }
                    data.write_all(&bytes[resume_offset..]).await.unwrap();
                    data.shutdown().await.unwrap();
                    "226 Transfer complete\r\n".to_owned()
                }
                "QUIT" => {
                    control.get_mut().write_all(b"221 Bye\r\n").await.unwrap();
                    break;
                }
                _ => "502 Command not implemented\r\n".to_owned(),
            };
            if control.get_mut().write_all(reply.as_bytes()).await.is_err() {
                break;
            }
        }
        commands
    }

    async fn serve_ftps(stream: TcpStream, acceptor: tokio_rustls::TlsAcceptor, bytes: Vec<u8>) {
        let mut raw = BufReader::new(stream);
        raw.get_mut()
            .write_all(b"220 IDG local FTPS fixture\r\n")
            .await
            .unwrap();
        let mut command = String::new();
        raw.read_line(&mut command).await.unwrap();
        assert!(command.starts_with("AUTH TLS"));
        raw.get_mut().write_all(b"234 Begin TLS\r\n").await.unwrap();
        let mut control = BufReader::new(acceptor.accept(raw.into_inner()).await.unwrap());
        let mut data_listener = None;
        loop {
            command.clear();
            if control.read_line(&mut command).await.unwrap_or(0) == 0 {
                break;
            }
            let mut parts = command.trim_end_matches(['\r', '\n']).splitn(2, ' ');
            let command = parts.next().unwrap_or("").to_ascii_uppercase();
            let argument = parts.next().unwrap_or("");
            let reply = match command.as_str() {
                "USER" if argument == "fixture-user" => "331 Password required\r\n".to_owned(),
                "USER" => "530 Invalid credentials\r\n".to_owned(),
                "PASS" if argument == "fixture-secret" => "230 Logged in\r\n".to_owned(),
                "PASS" => "530 Invalid credentials\r\n".to_owned(),
                "TYPE" | "PBSZ" | "PROT" => "200 Accepted\r\n".to_owned(),
                "SIZE" => format!("213 {}\r\n", bytes.len()),
                "MDTM" => "213 20260926120000\r\n".to_owned(),
                "EPSV" => {
                    let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
                    let data_port = listener.local_addr().unwrap().port();
                    data_listener = Some(listener);
                    format!("229 Entering Extended Passive Mode (|||{data_port}|)\r\n")
                }
                "RETR" => {
                    control
                        .get_mut()
                        .write_all(b"150 Opening protected data connection\r\n")
                        .await
                        .unwrap();
                    let listener = data_listener.take().expect("EPSV precedes RETR");
                    let (data, _) = listener.accept().await.unwrap();
                    let mut data = acceptor.accept(data).await.unwrap();
                    data.write_all(&bytes).await.unwrap();
                    data.shutdown().await.unwrap();
                    "226 Transfer complete\r\n".to_owned()
                }
                "QUIT" => {
                    control.get_mut().write_all(b"221 Bye\r\n").await.unwrap();
                    break;
                }
                _ => "502 Command not implemented\r\n".to_owned(),
            };
            control.get_mut().write_all(reply.as_bytes()).await.unwrap();
        }
    }

    #[tokio::test]
    async fn ftp_download_uses_credentials_epsv_and_shared_hash_checked_publication() {
        let bytes = b"fixture FTP bytes, not executable".to_vec();
        let (port, server) = fixture(bytes.clone()).await;
        let directory = tempfile::tempdir().unwrap();
        let expected = format!("{:x}", sha2::Sha256::digest(&bytes));
        let input = NewDownload {
            url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: Some(expected),
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("fixture-secret".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-fixture", input).unwrap();
        assert!(!format!("{:?}", job.input).contains("fixture-secret"));
        let snapshot = serde_json::to_string(&job.snapshot()).unwrap();
        assert!(!snapshot.contains("fixture-user"));
        assert!(!snapshot.contains("fixture-secret"));
        let (_sender, mut control) = watch::channel(Control::Run);
        let resources = resources::Resources::new(ResourceLimits::default());

        transfer_managed(&mut job, &mut control, &mut Store, resources)
            .await
            .unwrap();

        assert_eq!(job.state, TransferState::Completed);
        assert!(job.verified);
        assert_eq!(std::fs::read(&job.final_path).unwrap(), bytes);
        assert!(!std::path::Path::new(&job.temporary).exists());
        server.await.unwrap();
    }

    #[tokio::test]
    async fn ftp_rest_resumes_only_after_matching_identity_and_expected_hash_are_present() {
        let bytes = b"resumable FTP fixture payload".to_vec();
        let prefix = &bytes[..9];
        let (port, server) = fixture(bytes.clone()).await;
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: Some(format!("{:x}", sha2::Sha256::digest(&bytes))),
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("fixture-secret".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-rest", input).unwrap();
        std::fs::write(&job.temporary, prefix).unwrap();
        job.durable = prefix.len() as u64;
        job.received = job.durable;
        job.prefix_sha256 = format!("{:x}", sha2::Sha256::digest(prefix));
        job.total = Some(bytes.len() as u64);
        job.etag = Some(format!("ftp:{}:2026-09-26 12:00:00", bytes.len()));
        let (_sender, mut control) = watch::channel(Control::Run);

        transfer_managed(
            &mut job,
            &mut control,
            &mut Store,
            resources::Resources::new(ResourceLimits::default()),
        )
        .await
        .unwrap();

        assert_eq!(job.state, TransferState::Completed);
        assert!(job.verified);
        assert_eq!(std::fs::read(&job.final_path).unwrap(), bytes);
        server.await.unwrap();
    }

    #[tokio::test]
    async fn ftp_rejected_rest_preserves_partial_without_publishing() {
        let bytes = b"REST refusal must preserve this partial".to_vec();
        let prefix = &bytes[..9];
        let (port, server) = fixture_with_config(bytes.clone(), false, false).await;
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "rest-refused.bin".into(),
            expected_sha256: Some(format!("{:x}", sha2::Sha256::digest(&bytes))),
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("fixture-secret".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-rest-refused", input).unwrap();
        std::fs::write(&job.temporary, prefix).unwrap();
        job.durable = prefix.len() as u64;
        job.received = job.durable;
        job.prefix_sha256 = format!("{:x}", sha2::Sha256::digest(prefix));
        job.total = Some(bytes.len() as u64);
        job.etag = Some(format!("ftp:{}:2026-09-26 12:00:00", bytes.len()));
        let (_sender, mut control) = watch::channel(Control::Run);

        assert_eq!(
            transfer_managed(
                &mut job,
                &mut control,
                &mut Store,
                resources::Resources::new(ResourceLimits::default()),
            )
            .await,
            Err(DownloadError::UnsafeResume)
        );
        assert_eq!(std::fs::read(&job.temporary).unwrap(), prefix);
        assert!(!std::path::Path::new(&job.final_path).exists());
        server.await.unwrap();
    }

    #[tokio::test]
    async fn ftp_rejects_wrong_password_without_publishing() {
        let (port, server) = fixture(b"must not download".to_vec()).await;
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "wrong-password.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("wrong-password".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-wrong-password", input).unwrap();
        let (_sender, mut control) = watch::channel(Control::Run);
        assert_eq!(
            transfer_managed(
                &mut job,
                &mut control,
                &mut Store,
                resources::Resources::new(ResourceLimits::default()),
            )
            .await,
            Err(DownloadError::AccessDenied)
        );
        assert!(!std::path::Path::new(&job.final_path).exists());
        assert_eq!(server.await.unwrap(), ["USER", "PASS"]);
    }

    #[tokio::test]
    async fn ftp_disconnect_during_data_never_publishes_short_file() {
        let (port, server) = fixture_with_config(
            b"partial transfer must not be published".to_vec(),
            true,
            true,
        )
        .await;
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "disconnected.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("fixture-secret".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-disconnect", input).unwrap();
        let (_sender, mut control) = watch::channel(Control::Run);
        assert!(matches!(
            transfer_managed(
                &mut job,
                &mut control,
                &mut Store,
                resources::Resources::new(ResourceLimits::default()),
            )
            .await,
            Err(DownloadError::Network | DownloadError::Timeout)
        ));
        assert_eq!(std::fs::read(&job.temporary).unwrap(), b"par");
        assert!(!std::path::Path::new(&job.final_path).exists());
        let commands = server.await.unwrap();
        assert!(commands.iter().any(|command| command == "RETR"));
    }

    #[tokio::test]
    async fn ftp_without_cleartext_confirmation_is_rejected_before_connecting() {
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: "ftp://127.0.0.1:1/fixture.bin".into(),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
            auth: None,
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-warning", input).unwrap();
        job.input.allow_cleartext_ftp = false;
        let (_sender, mut control) = watch::channel(Control::Run);

        assert_eq!(
            transfer_managed(
                &mut job,
                &mut control,
                &mut Store,
                resources::Resources::new(ResourceLimits::default()),
            )
            .await,
            Err(DownloadError::AccessDenied)
        );
        assert_eq!(job.state, TransferState::Probing);
    }

    #[tokio::test]
    async fn cancel_during_size_stops_before_mdtm_epsv_and_retr() {
        tokio::task::LocalSet::new()
            .run_until(async {
                let bytes = b"cancel fixture bytes".to_vec();
                let (port, server, size_seen, release_size) = delayed_size_fixture(bytes).await;
                let directory = tempfile::tempdir().unwrap();
                let input = NewDownload {
                    url: format!("ftp://127.0.0.1:{port}/fixture.bin"),
                    directory: directory.path().to_string_lossy().into_owned(),
                    name: "cancelled.bin".into(),
                    expected_sha256: None,
                    conflict: ConflictPolicy::Reject,
                    auth: Some(DownloadAuth {
                        username: Some("fixture-user".into()),
                        password: Some("fixture-secret".into()),
                        headers: Vec::new(),
                    }),
                    allow_cleartext_ftp: true,
                };
                let mut job = create_job("ftp-cancel-size", input).unwrap();
                let (sender, mut control) = watch::channel(Control::Run);
                let resources = resources::Resources::new(ResourceLimits::default());
                let transfer = tokio::task::spawn_local(async move {
                    let result =
                        transfer_managed(&mut job, &mut control, &mut Store, resources).await;
                    (result, job)
                });

                tokio::time::timeout(Duration::from_secs(3), size_seen)
                    .await
                    .expect("fixture did not receive SIZE")
                    .unwrap();
                sender.send_replace(Control::Cancel);
                release_size.send(()).unwrap();

                let (result, job) = tokio::time::timeout(Duration::from_secs(3), transfer)
                    .await
                    .expect("FTP transfer did not observe cancellation")
                    .unwrap();
                assert_eq!(result, Ok(()));
                assert_eq!(job.state, TransferState::Cancelled);
                let commands = server.await.unwrap();
                for expected in ["USER", "PASS", "TYPE", "SIZE"] {
                    assert!(commands.iter().any(|command| command == expected));
                }
                for forbidden in ["MDTM", "EPSV", "RETR"] {
                    assert!(
                        !commands.iter().any(|command| command == forbidden),
                        "{commands:?}"
                    );
                }
                assert!(!std::path::Path::new(&job.final_path).exists());
            })
            .await;
    }

    #[tokio::test]
    async fn ftp_rejects_multi_request_options_before_connecting() {
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: "ftp://127.0.0.1:1/fixture.bin".into(),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
            auth: None,
            allow_cleartext_ftp: true,
        };
        let mut job = create_job("ftp-single-request", input).unwrap();
        job.options.mode = RequestMode::Manual { requests: 2 };
        let (_sender, mut control) = watch::channel(Control::Run);

        assert_eq!(
            transfer_managed(
                &mut job,
                &mut control,
                &mut Store,
                resources::Resources::new(ResourceLimits::default()),
            )
            .await,
            Err(DownloadError::InvalidInput)
        );
    }

    #[tokio::test]
    async fn ftps_rejects_an_untrusted_certificate_before_requesting_credentials() {
        use tokio_rustls::{TlsAcceptor, rustls};

        let certificate = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
        let cert = certificate.cert.der().clone();
        let key =
            rustls::pki_types::PrivateKeyDer::Pkcs8(certificate.signing_key.serialize_der().into());
        let config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert], key)
            .unwrap();
        let acceptor = TlsAcceptor::from(std::sync::Arc::new(config));
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            let mut control = BufReader::new(stream);
            control
                .get_mut()
                .write_all(b"220 IDG local FTPS fixture\r\n")
                .await
                .unwrap();
            let mut command = String::new();
            control.read_line(&mut command).await.unwrap();
            assert!(command.starts_with("AUTH TLS"));
            control
                .get_mut()
                .write_all(b"234 Begin TLS\r\n")
                .await
                .unwrap();
            let _ = acceptor.accept(control.into_inner()).await;
        });

        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: format!("ftps://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("must-not-be-sent".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: false,
        };
        let mut job = create_job("ftps-invalid-cert", input).unwrap();
        let (_sender, mut control) = watch::channel(Control::Run);
        let result = transfer_managed(
            &mut job,
            &mut control,
            &mut Store,
            resources::Resources::new(ResourceLimits::default()),
        )
        .await;

        assert_eq!(result, Err(DownloadError::Tls));
        assert!(!std::path::Path::new(&job.final_path).exists());
        server.await.unwrap();
    }

    #[tokio::test]
    async fn ftps_uses_tls_for_control_and_data_and_publishes_verified_bytes() {
        use tokio_rustls::{TlsAcceptor, rustls};

        let certificate = rcgen::generate_simple_self_signed(vec!["127.0.0.1".into()]).unwrap();
        let cert = certificate.cert.der().clone();
        let key =
            rustls::pki_types::PrivateKeyDer::Pkcs8(certificate.signing_key.serialize_der().into());
        let server_config = rustls::ServerConfig::builder()
            .with_no_client_auth()
            .with_single_cert(vec![cert.clone()], key)
            .unwrap();
        let acceptor = TlsAcceptor::from(std::sync::Arc::new(server_config));
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let bytes = b"protected FTPS fixture bytes".to_vec();
        let server_bytes = bytes.clone();
        let server = tokio::spawn(async move {
            let (stream, _) = listener.accept().await.unwrap();
            serve_ftps(stream, acceptor, server_bytes).await;
        });

        let mut roots = rustls::RootCertStore::empty();
        roots.add(cert).unwrap();
        let client_tls = std::sync::Arc::new(
            rustls::ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth(),
        );
        let directory = tempfile::tempdir().unwrap();
        let expected = format!("{:x}", sha2::Sha256::digest(&bytes));
        let input = NewDownload {
            url: format!("ftps://127.0.0.1:{port}/fixture.bin"),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "fixture.bin".into(),
            expected_sha256: Some(expected),
            conflict: ConflictPolicy::Reject,
            auth: Some(DownloadAuth {
                username: Some("fixture-user".into()),
                password: Some("fixture-secret".into()),
                headers: Vec::new(),
            }),
            allow_cleartext_ftp: false,
        };
        let mut job = create_job("ftps-fixture", input).unwrap();
        let (_sender, mut control) = watch::channel(Control::Run);

        transfer_managed_with_tls(
            &mut job,
            &mut control,
            &mut Store,
            resources::Resources::new(ResourceLimits::default()),
            client_tls,
        )
        .await
        .unwrap();

        assert_eq!(job.state, TransferState::Completed);
        assert!(job.verified);
        assert_eq!(std::fs::read(&job.final_path).unwrap(), bytes);
        server.await.unwrap();
    }

    #[test]
    fn ftp_paths_reject_encoded_command_separators() {
        for raw in [
            "ftp://example.test/%0d%0aQUIT",
            "ftp://example.test/%00file",
        ] {
            let url = reqwest::Url::parse(raw).unwrap();
            assert_eq!(remote_path(&url), Err(DownloadError::InvalidInput));
        }
        assert_eq!(
            remote_path(&reqwest::Url::parse("ftp://example.test/a%20b.bin").unwrap()),
            Ok("/a b.bin".into())
        );
    }
}
