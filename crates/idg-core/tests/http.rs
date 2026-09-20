use idg_core::download::*;
use idg_protocol::*;
use sha2::{Digest, Sha256};
use std::sync::{Arc, Mutex};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
    sync::watch,
};

#[derive(Default)]
struct MemoryStore {
    saved: Vec<Job>,
    fail_completed: bool,
}
impl Checkpoint for MemoryStore {
    fn save(&mut self, j: &Job) -> Result<(), DownloadError> {
        if self.fail_completed && j.state == TransferState::Completed {
            return Err(DownloadError::Storage);
        }
        self.saved.push(j.clone());
        Ok(())
    }
}
struct Server {
    url: String,
    requests: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}
async fn server(reply: impl Fn(&str) -> Vec<u8> + Send + Sync + 'static) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let records = requests.clone();
    let reply = Arc::new(reply);
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let reply = reply.clone();
            let records = records.clone();
            tokio::spawn(async move {
                let mut request = Vec::new();
                let mut byte = [0];
                while request.len() < 16384 {
                    if stream.read_exact(&mut byte).await.is_err() {
                        return;
                    }
                    request.push(byte[0]);
                    if request.ends_with(b"\r\n\r\n") {
                        break;
                    }
                }
                let text = String::from_utf8(request).unwrap();
                records.lock().unwrap().push(text.clone());
                let response = reply(&text);
                let _ = stream.write_all(&response).await;
            });
        }
    });
    Server {
        url: format!("http://{address}/file"),
        requests,
        task,
    }
}
fn response(status: u16, headers: &str, body: &[u8]) -> Vec<u8> {
    let mut v =
        format!("HTTP/1.1 {status} Fixture\r\nConnection: close\r\n{headers}\r\n").into_bytes();
    v.extend_from_slice(body);
    v
}
fn input(dir: &tempfile::TempDir, url: String) -> NewDownload {
    NewDownload {
        url,
        directory: dir.path().to_string_lossy().into(),
        name: "prueba-ñ.bin".into(),
        expected_sha256: None,
        conflict: ConflictPolicy::Reject,
    }
}
async fn run(j: &mut Job, s: &mut MemoryStore) -> Result<(), DownloadError> {
    let (_tx, mut rx) = watch::channel(Control::Run);
    transfer(&client().unwrap(), j, &mut rx, s).await
}
fn partial(j: &mut Job, data: &[u8], total: u64) {
    std::fs::write(&j.temporary, data).unwrap();
    j.durable = data.len() as u64;
    j.received = j.durable;
    j.total = Some(total);
    j.prefix_sha256 = format!("{:x}", Sha256::digest(data));
    j.etag = Some("\"v1\"".into());
    j.effective_url = Some(j.input.url.clone());
    j.state = TransferState::Paused;
}

#[tokio::test]
async fn real_get_known_unknown_head_denied_and_zero() {
    for (known, data) in [
        (true, b"correct file".as_slice()),
        (false, b"unknown length".as_slice()),
        (true, b"".as_slice()),
        (true, b"x".as_slice()),
    ] {
        let body = data.to_vec();
        let expected = format!("{:x}", Sha256::digest(data));
        let server = server(move |r| {
            if r.starts_with("HEAD ") {
                return response(405, "", &[]);
            }
            let headers = if known {
                format!("Content-Length: {}\r\nETag: \"v1\"\r\n", body.len())
            } else {
                String::new()
            };
            response(200, &headers, &body)
        })
        .await;
        let dir = tempfile::tempdir().unwrap();
        let mut spec = input(&dir, server.url.clone());
        spec.expected_sha256 = Some(expected);
        let mut j = create_job("known", spec).unwrap();
        let mut store = MemoryStore::default();
        run(&mut j, &mut store).await.unwrap();
        assert_eq!(j.state, TransferState::Completed);
        assert!(j.verified);
        assert_eq!(std::fs::read(&j.final_path).unwrap(), data);
        assert_eq!(server.requests.lock().unwrap().len(), 1);
        assert!(!server.requests.lock().unwrap()[0].starts_with("HEAD"));
    }
}
#[tokio::test]
async fn ranges_require_correct_representation_and_bounds() {
    for (status, headers, expected) in [
        (
            200,
            "Content-Length: 6\r\nETag: \"v1\"\r\n",
            DownloadError::RangeIgnored,
        ),
        (
            206,
            "Content-Length: 3\r\nETag: \"v2\"\r\nContent-Range: bytes 3-5/6\r\n",
            DownloadError::ResourceChanged,
        ),
        (
            206,
            "Content-Length: 3\r\nETag: \"v1\"\r\nContent-Range: bytes 2-4/6\r\n",
            DownloadError::InvalidRange,
        ),
        (
            416,
            "Content-Length: 0\r\nETag: \"v1\"\r\nContent-Range: bytes */9\r\n",
            DownloadError::InvalidRange,
        ),
    ] {
        let server = server(move |_| response(status, headers, b"xyz")).await;
        let dir = tempfile::tempdir().unwrap();
        let mut j = create_job("range", input(&dir, server.url.clone())).unwrap();
        partial(&mut j, b"abc", 6);
        assert_eq!(
            run(&mut j, &mut MemoryStore::default()).await,
            Err(expected)
        );
        assert_eq!(std::fs::read(&j.temporary).unwrap(), b"abc");
        assert!(!std::path::Path::new(&j.final_path).exists());
    }
    let server = server(|r| {
        assert!(r.to_lowercase().contains("range: bytes=3-"));
        assert!(r.to_lowercase().contains("if-range: \"v1\""));
        response(
            206,
            "Content-Length: 3\r\nContent-Range: bytes 3-5/6\r\nETag: \"v1\"\r\n",
            b"def",
        )
    })
    .await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("safe", input(&dir, server.url.clone())).unwrap();
    partial(&mut j, b"abc", 6);
    j.input.expected_sha256 = Some(format!("{:x}", Sha256::digest(b"abcdef")));
    run(&mut j, &mut MemoryStore::default()).await.unwrap();
    assert!(j.range_confirmed && j.verified);
    assert_eq!(std::fs::read(&j.final_path).unwrap(), b"abcdef");
}
#[tokio::test]
async fn exact_416_needs_matching_total_validator_and_hash() {
    let server = server(|_| {
        response(
            416,
            "Content-Length: 0\r\nContent-Range: bytes */3\r\nETag: \"v1\"\r\n",
            &[],
        )
    })
    .await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("end", input(&dir, server.url.clone())).unwrap();
    partial(&mut j, b"abc", 3);
    run(&mut j, &mut MemoryStore::default()).await.unwrap();
    assert_eq!(j.state, TransferState::Completed);
    assert!(!j.verified);
}
#[tokio::test]
async fn changed_last_modified_with_same_etag_is_not_appended() {
    let server = server(|_| response(206, "Content-Length: 3\r\nContent-Range: bytes 3-5/6\r\nETag: \"v1\"\r\nLast-Modified: Wed, 02 Jan 2030 00:00:00 GMT\r\n", b"def")).await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("changed-date", input(&dir, server.url.clone())).unwrap();
    partial(&mut j, b"abc", 6);
    j.last_modified = Some("Tue, 01 Jan 2030 00:00:00 GMT".into());
    assert_eq!(
        run(&mut j, &mut MemoryStore::default()).await,
        Err(DownloadError::ResourceChanged)
    );
    assert_eq!(std::fs::read(&j.temporary).unwrap(), b"abc");
}
#[tokio::test]
async fn legacy_phase03_partial_defaults_and_resumes_without_restart() {
    let server = server(|request| {
        assert!(request.to_lowercase().contains("range: bytes=3-"));
        response(
            206,
            "Content-Length: 3\r\nContent-Range: bytes 3-5/6\r\nETag: \"v1\"\r\n",
            b"def",
        )
    })
    .await;
    let dir = tempfile::tempdir().unwrap();
    let mut original = create_job("legacy", input(&dir, server.url.clone())).unwrap();
    partial(&mut original, b"abc", 6);
    let mut old = serde_json::to_value(&original).unwrap();
    for key in ["options", "ranges", "transferred", "retries", "strategy"] {
        old.as_object_mut().unwrap().remove(key);
    }
    let mut recovered: Job = serde_json::from_value(old).unwrap();
    assert!(recovered.ranges.is_empty());
    assert_eq!(recovered.durable, 3);
    run(&mut recovered, &mut MemoryStore::default())
        .await
        .unwrap();
    assert_eq!(std::fs::read(&recovered.final_path).unwrap(), b"abcdef");
    assert_eq!(server.requests.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn hash_mismatch_and_conflict_preserve_existing_file() {
    let server = server(|_| response(200, "Content-Length: 3\r\n", b"abc")).await;
    let dir = tempfile::tempdir().unwrap();
    let mut spec = input(&dir, server.url.clone());
    std::fs::write(dir.path().join(&spec.name), b"old").unwrap();
    assert!(matches!(
        create_job("reject", spec.clone()),
        Err(DownloadError::Conflict)
    ));
    spec.conflict = ConflictPolicy::Replace;
    spec.expected_sha256 = Some("0".repeat(64));
    let mut j = create_job("replace", spec).unwrap();
    assert_eq!(
        run(&mut j, &mut MemoryStore::default()).await,
        Err(DownloadError::HashMismatch)
    );
    assert_eq!(std::fs::read(&j.final_path).unwrap(), b"old");
    assert_eq!(std::fs::read(&j.temporary).unwrap(), b"abc");
}
#[tokio::test]
async fn no_validator_tampered_partial_and_pre_cancel_do_not_consume_url() {
    let server = server(|_| panic!("must not issue GET")).await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("nocall", input(&dir, server.url.clone())).unwrap();
    partial(&mut j, b"abc", 6);
    j.etag = None;
    assert_eq!(
        run(&mut j, &mut MemoryStore::default()).await,
        Err(DownloadError::UnsafeResume)
    );
    j.etag = Some("\"v1\"".into());
    std::fs::write(&j.temporary, b"xyz").unwrap();
    assert_eq!(
        run(&mut j, &mut MemoryStore::default()).await,
        Err(DownloadError::PartialChanged)
    );
    partial(&mut j, b"abc", 6);
    let (_tx, mut rx) = watch::channel(Control::Cancel);
    transfer(
        &client().unwrap(),
        &mut j,
        &mut rx,
        &mut MemoryStore::default(),
    )
    .await
    .unwrap();
    assert_eq!(j.state, TransferState::Cancelled);
    assert!(server.requests.lock().unwrap().is_empty());
}
#[tokio::test]
async fn published_file_reconciles_after_completed_checkpoint_failure() {
    let server = server(|_| response(200, "Content-Length: 3\r\n", b"abc")).await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("recover", input(&dir, server.url.clone())).unwrap();
    let mut store = MemoryStore {
        fail_completed: true,
        ..Default::default()
    };
    assert_eq!(run(&mut j, &mut store).await, Err(DownloadError::Storage));
    assert_eq!(j.state, TransferState::PublishPending);
    assert_eq!(run(&mut j, &mut store).await, Err(DownloadError::Storage));
    assert_eq!(j.state, TransferState::PublishPending);
    store.fail_completed = false;
    run(&mut j, &mut store).await.unwrap();
    assert_eq!(j.state, TransferState::Completed);
    assert_eq!(server.requests.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn real_https_trust_is_scoped_to_test_and_invalid_tls_is_rejected() {
    use tokio_rustls::{TlsAcceptor, rustls};
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let der = cert.cert.der().clone();
    let key = rustls::pki_types::PrivatePkcs8KeyDer::from(cert.signing_key.serialize_der());
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![der.clone()], key.into())
        .unwrap();
    let acceptor = TlsAcceptor::from(Arc::new(config));
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!(
        "https://localhost:{}/file",
        listener.local_addr().unwrap().port()
    );
    let task = tokio::spawn(async move {
        loop {
            let (s, _) = listener.accept().await.unwrap();
            let acceptor = acceptor.clone();
            tokio::spawn(async move {
                if let Ok(mut s) = acceptor.accept(s).await {
                    let mut buf = [0; 4096];
                    let _ = s.read(&mut buf).await;
                    let _ = s
                        .write_all(&response(200, "Content-Length: 3\r\n", b"tls"))
                        .await;
                }
            });
        }
    });
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("invalid-tls", input(&dir, url.clone())).unwrap();
    assert!(run(&mut j, &mut MemoryStore::default()).await.is_err());
    assert!(!std::path::Path::new(&j.final_path).exists());
    let mut j = create_job("valid-tls", input(&dir, url)).unwrap();
    let trusted = reqwest::Client::builder()
        .tls_certs_only([reqwest::Certificate::from_der(&der).unwrap()])
        .build()
        .unwrap();
    let (_tx, mut rx) = watch::channel(Control::Run);
    transfer(&trusted, &mut j, &mut rx, &mut MemoryStore::default())
        .await
        .unwrap();
    assert_eq!(std::fs::read(&j.final_path).unwrap(), b"tls");
    task.abort();
}

#[tokio::test]
async fn pause_from_checkpoint_then_resume_and_discard_unsynced_tail() {
    struct Pauser {
        control: watch::Sender<Control>,
    }
    impl Checkpoint for Pauser {
        fn save(&mut self, j: &Job) -> Result<(), DownloadError> {
            if j.durable >= 1048576 && j.state == TransferState::Downloading {
                self.control.send_replace(Control::Pause);
            }
            Ok(())
        }
    }
    let body = vec![42u8; 3 * 1024 * 1024];
    let expected = format!("{:x}", Sha256::digest(&body));
    let server = server(move |r| {
        let start = r
            .lines()
            .find_map(|l| {
                l.to_lowercase()
                    .strip_prefix("range: bytes=")
                    .map(str::to_owned)
            })
            .and_then(|s| s.trim_end_matches('-').parse::<usize>().ok());
        let start = start.unwrap_or(0);
        let headers = if start > 0 {
            format!(
                "Content-Length: {}\r\nContent-Range: bytes {start}-{}/{}\r\nETag: \"v1\"\r\n",
                body.len() - start,
                body.len() - 1,
                body.len()
            )
        } else {
            format!("Content-Length: {}\r\nETag: \"v1\"\r\n", body.len())
        };
        response(if start == 0 { 200 } else { 206 }, &headers, &body[start..])
    })
    .await;
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("pause", input(&dir, server.url.clone())).unwrap();
    j.input.expected_sha256 = Some(expected);
    let (tx, mut rx) = watch::channel(Control::Run);
    transfer(
        &client().unwrap(),
        &mut j,
        &mut rx,
        &mut Pauser { control: tx },
    )
    .await
    .unwrap();
    assert_eq!(j.state, TransferState::Paused);
    assert!(j.durable > 0 && j.durable < 3 * 1024 * 1024);
    use std::io::Write;
    std::fs::OpenOptions::new()
        .append(true)
        .open(&j.temporary)
        .unwrap()
        .write_all(b"uncheckpointed tail")
        .unwrap();
    run(&mut j, &mut MemoryStore::default()).await.unwrap();
    assert!(j.verified);
    assert_eq!(j.durable, 3 * 1024 * 1024);
}
#[cfg(windows)]
#[tokio::test]
async fn windows_locked_destination_is_recoverable_without_truncation() {
    use std::os::windows::fs::OpenOptionsExt;
    let server = server(|_| response(200, "Content-Length: 3\r\n", b"new")).await;
    let dir = tempfile::tempdir().unwrap();
    let mut spec = input(&dir, server.url.clone());
    let final_path = dir.path().join(&spec.name);
    std::fs::write(&final_path, b"old").unwrap();
    spec.conflict = ConflictPolicy::Replace;
    let held = std::fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&final_path)
        .unwrap();
    let mut j = create_job("locked", spec).unwrap();
    assert_eq!(
        run(&mut j, &mut MemoryStore::default()).await,
        Err(DownloadError::PublishBlocked)
    );
    assert_eq!(j.state, TransferState::PublishPending);
    assert_eq!(std::fs::read(&final_path).unwrap(), b"old");
    drop(held);
    run(&mut j, &mut MemoryStore::default()).await.unwrap();
    assert_eq!(std::fs::read(&final_path).unwrap(), b"new");
    assert_eq!(server.requests.lock().unwrap().len(), 1);
}
#[tokio::test]
async fn run_notification_during_headers_keeps_the_same_request() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/once", listener.local_addr().unwrap());
    let (tx, mut rx) = watch::channel(Control::Run);
    let task = tokio::spawn(async move {
        let (mut stream, _) = listener.accept().await.unwrap();
        let mut b = [0; 4096];
        assert!(stream.read(&mut b).await.unwrap() > 0);
        tx.send_replace(Control::Run);
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        stream
            .write_all(&response(200, "Content-Length: 3\r\n", b"one"))
            .await
            .unwrap();
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    });
    let dir = tempfile::tempdir().unwrap();
    let mut j = create_job("one", input(&dir, url)).unwrap();
    transfer(
        &client().unwrap(),
        &mut j,
        &mut rx,
        &mut MemoryStore::default(),
    )
    .await
    .unwrap();
    assert_eq!(j.state, TransferState::Completed);
    task.await.unwrap();
}
