use super::*;
use reqwest::{Client, Response, Url, header::*};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tokio::{io::AsyncWriteExt, sync::watch};

pub fn client() -> Result<Client, DownloadError> {
    Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .referer(false)
        .retry(reqwest::retry::never())
        .no_gzip()
        .no_brotli()
        .no_deflate()
        .no_zstd()
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(20))
        .user_agent("IDG/0.1 development")
        .build()
        .map_err(|_| DownloadError::Tls)
}
pub(super) fn network(e: reqwest::Error) -> DownloadError {
    if e.is_timeout() {
        DownloadError::Timeout
    } else {
        DownloadError::Network
    }
}
pub(super) fn header(response: &Response, name: HeaderName) -> Option<String> {
    response
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(str::to_owned)
}
async fn get(
    client: &Client,
    job: &Job,
    budget: &std::sync::Arc<resources::Resources>,
    mut control: watch::Receiver<Control>,
) -> Result<(Response, resources::Permit), DownloadError> {
    let mut url = Url::parse(&job.input.url).map_err(|_| DownloadError::InvalidInput)?;
    url.set_fragment(None);
    for hop in 0..=5 {
        let permit = budget
            .acquire(
                &job.id,
                &url.origin().ascii_serialization(),
                job.options.priority.clone(),
                &mut control,
            )
            .await?;
        let mut request = client.get(url.clone()).header(ACCEPT_ENCODING, "identity");
        if job.durable > 0 {
            request = request
                .header(RANGE, format!("bytes={}-", job.durable))
                .header(
                    IF_RANGE,
                    job.etag.as_ref().ok_or(DownloadError::UnsafeResume)?,
                );
        }
        let response = request.send().await.map_err(network)?;
        if response.status().is_redirection() {
            if hop == 5 {
                return Err(DownloadError::HttpStatus);
            }
            let location = header(&response, LOCATION).ok_or(DownloadError::HttpStatus)?;
            let next = url.join(&location).map_err(|_| DownloadError::HttpStatus)?;
            if !matches!(next.scheme(), "http" | "https")
                || !next.username().is_empty()
                || next.password().is_some()
                || (url.scheme() == "https" && next.scheme() != "https")
            {
                return Err(DownloadError::AccessDenied);
            }
            // No cookie jar, Authorization or Referer. Never forward origin credentials.
            url = next;
            continue;
        }
        return Ok((response, permit));
    }
    Err(DownloadError::HttpStatus)
}
pub(super) fn range(s: &str) -> Option<(u64, u64, u64)> {
    let s = s.strip_prefix("bytes ")?;
    let (r, total) = s.split_once('/')?;
    let (start, end) = r.split_once('-')?;
    Some((start.parse().ok()?, end.parse().ok()?, total.parse().ok()?))
}

async fn checkpoint(
    file: &mut tokio::fs::File,
    job: &mut Job,
    hash: &Sha256,
    store: &mut dyn Checkpoint,
) -> Result<(), DownloadError> {
    file.flush().await.map_err(file_error)?;
    file.sync_all().await.map_err(file_error)?;
    let old = (job.durable, job.prefix_sha256.clone());
    job.durable = job.received;
    job.prefix_sha256 = format!("{:x}", hash.clone().finalize());
    if let Err(e) = store.save(job) {
        job.durable = old.0;
        job.prefix_sha256 = old.1;
        return Err(e);
    }
    Ok(())
}
async fn write_chunk<W: tokio::io::AsyncWrite + Unpin>(
    writer: &mut W,
    chunk: &[u8],
) -> Result<(), DownloadError> {
    writer.write_all(chunk).await.map_err(file_error)
}
pub(super) async fn finish(job: &mut Job, store: &mut dyn Checkpoint) -> Result<(), DownloadError> {
    if job.total.is_some_and(|n| n != job.durable) {
        return Err(DownloadError::SizeMismatch);
    }
    job.state = TransferState::Verifying;
    store.save(job)?;
    job.calculated_sha256 = Some(job.prefix_sha256.clone());
    if let Some(expected) = &job.input.expected_sha256 {
        if !expected.eq_ignore_ascii_case(&job.prefix_sha256) {
            return Err(DownloadError::HashMismatch);
        }
        job.verified = true;
    }
    job.state = TransferState::PublishPending;
    store.save(job)?;
    files::publish(job, store)?;
    job.state = TransferState::Completed;
    job.error = None;
    if let Err(e) = store.save(job) {
        job.state = TransferState::PublishPending;
        return Err(e);
    }
    Ok(())
}
/// One GET body at a time; no speculative HEAD or range probe consumes one-use links.
/// Checkpoints precede ACKs; received bytes are never reported as durable until sync.
pub async fn transfer(
    client: &Client,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
) -> Result<(), DownloadError> {
    transfer_managed(
        client,
        job,
        control,
        store,
        resources::Resources::new(ResourceLimits::default()),
    )
    .await
}
pub async fn transfer_managed(
    client: &Client,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: std::sync::Arc<resources::Resources>,
) -> Result<(), DownloadError> {
    let mut attempts = 0;
    let result = loop {
        let result = transfer_inner(client, job, control, store, budget.clone()).await;
        if !job.options.replay_safe
            || !job.ranges.is_empty()
            || attempts >= 3
            || !matches!(
                result,
                Err(DownloadError::Network | DownloadError::Timeout | DownloadError::RetryLater)
            )
        {
            break result;
        }
        let retry_after = Duration::from_secs(job.retry_after_seconds.unwrap_or(0) as u64);
        if retry_after > Duration::from_secs(3600) {
            break result;
        }
        attempts += 1;
        job.retries += 1;
        job.active_requests = 0;
        let wait = retry_after.max(Duration::from_millis(
            (250u64 << attempts) + (job.received % 101),
        ));
        let origin = Url::parse(&job.input.url)
            .map_err(|_| DownloadError::InvalidInput)?
            .origin()
            .ascii_serialization();
        if result == Err(DownloadError::RetryLater) {
            budget.defer_origin(&origin, wait);
        }
        store.save(job)?;
        if let Err(error) = resources::delay(wait, control).await {
            break Err(error);
        }
    };
    job.active_requests = 0;
    budget.forget_file(&job.id);
    if result == Err(DownloadError::InvalidState) && *control.borrow() != Control::Run {
        job.received = job.durable;
        job.state = if *control.borrow() == Control::Cancel {
            TransferState::Cancelled
        } else {
            TransferState::Paused
        };
        store.save(job)?;
        return Ok(());
    }
    result
}
async fn transfer_inner(
    client: &Client,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: std::sync::Arc<resources::Resources>,
) -> Result<(), DownloadError> {
    job.options.validate()?;
    if !job.ranges.is_empty()
        && !matches!(
            job.state,
            TransferState::PublishPending | TransferState::Verifying | TransferState::Completed
        )
    {
        return super::segmented::transfer(client, job, control, store, budget).await;
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
        return finish(job, store).await;
    }
    if job.durable > 0 && job.etag.is_none() {
        return Err(DownloadError::UnsafeResume);
    }
    let (file, mut hash) = files::open_partial(job)?;
    if job.durable > 0 && eligible(job) && job.total.is_some_and(|n| n > job.durable) {
        drop(file);
        job.ranges = ranges::plan(job.total.unwrap(), job.durable, &job.prefix_sha256)?;
        store.save(job)?;
        return super::segmented::transfer(client, job, control, store, budget).await;
    }
    let mut file = tokio::fs::File::from_std(file);
    job.received = job.durable;
    if *control.borrow() != Control::Run {
        job.state = if *control.borrow() == Control::Cancel {
            TransferState::Cancelled
        } else {
            TransferState::Paused
        };
        store.save(job)?;
        return Ok(());
    }
    job.active_requests = 0;
    job.target_requests = 1;
    let response = {
        let pending = get(client, job, &budget, control.clone());
        tokio::pin!(pending);
        loop {
            tokio::select! {
                result=&mut pending=>break Some(result?),
                result=control.changed()=>{
                    if result.is_err()||*control.borrow()!=Control::Run{break None;}
                }
            }
        }
    };
    let Some((response, permit)) = response else {
        job.state = if *control.borrow() == Control::Cancel {
            TransferState::Cancelled
        } else {
            TransferState::Paused
        };
        store.save(job)?;
        return Ok(());
    };
    job.active_requests = 1;
    let status = response.status().as_u16();
    if matches!(status, 401 | 403) {
        return Err(DownloadError::AccessDenied);
    }
    if matches!(status, 404 | 410) {
        return Err(DownloadError::Expired);
    }
    if matches!(status, 429 | 503) {
        let now = std::time::SystemTime::now();
        job.retry_after_seconds = header(&response, RETRY_AFTER).and_then(|v| {
            v.parse::<u32>().ok().or_else(|| {
                httpdate::parse_http_date(&v).ok().map(|date| {
                    date.duration_since(now)
                        .unwrap_or_default()
                        .as_secs()
                        .min(u32::MAX as u64) as u32
                })
            })
        });
        job.retry_not_before = job.retry_after_seconds.map(|s| {
            now.duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
                .saturating_add(s as u64)
        });
        return Err(DownloadError::RetryLater);
    }
    if header(&response, CONTENT_ENCODING).is_some_and(|v| !v.eq_ignore_ascii_case("identity"))
        || header(&response, CONTENT_TYPE)
            .is_some_and(|v| v.to_lowercase().starts_with("text/html"))
    {
        return Err(DownloadError::Representation);
    }
    let etag = header(&response, ETAG).filter(|v| {
        v.len() >= 2
            && v.len() <= 1024
            && v.starts_with('"')
            && v.ends_with('"')
            && v.as_bytes()[1..v.len() - 1]
                .iter()
                .all(|b| *b == 0x21 || (0x23..=0x7e).contains(b))
    });
    if job.durable > 0 {
        if job.effective_url.as_deref() != Some(response.url().as_str())
            || etag != job.etag
            || job
                .last_modified
                .as_ref()
                .is_some_and(|old| header(&response, LAST_MODIFIED).as_ref() != Some(old))
        {
            return Err(DownloadError::ResourceChanged);
        }
        if status == 200 {
            return Err(DownloadError::RangeIgnored);
        }
        if status == 416 {
            let total = header(&response, CONTENT_RANGE).and_then(|s| {
                s.strip_prefix("bytes */")
                    .and_then(|n| n.parse::<u64>().ok())
            });
            if total == Some(job.durable) && job.total == total {
                drop(file);
                return finish(job, store).await;
            }
            return Err(DownloadError::InvalidRange);
        }
        if status != 206 {
            return Err(DownloadError::HttpStatus);
        }
        let (start, end, total) = header(&response, CONTENT_RANGE)
            .and_then(|s| range(&s))
            .ok_or(DownloadError::InvalidRange)?;
        if start != job.durable
            || end < start
            || end.checked_add(1) != Some(total)
            || job.total.is_some_and(|old| old != total)
            || response
                .content_length()
                .is_some_and(|n| n != end - start + 1)
        {
            return Err(DownloadError::InvalidRange);
        }
        job.total = Some(total);
        job.range_confirmed = true;
    } else {
        if status != 200 {
            return Err(DownloadError::HttpStatus);
        }
        job.total = response.content_length();
        job.etag = etag;
        job.last_modified = header(&response, LAST_MODIFIED);
        job.effective_url = Some(response.url().to_string());
    }
    let parallel_hint =
        header(&response, ACCEPT_RANGES).is_some_and(|v| v.eq_ignore_ascii_case("bytes"));
    job.state = TransferState::Downloading;
    job.error = None;
    job.retry_after_seconds = None;
    store.save(job)?;
    let mut response = response;
    let mut last_checkpoint = Instant::now();
    let mut last_report = Instant::now();
    loop {
        if *control.borrow() != Control::Run {
            checkpoint(&mut file, job, &hash, store).await?;
            job.state = if *control.borrow() == Control::Cancel {
                TransferState::Cancelled
            } else {
                TransferState::Paused
            };
            store.save(job)?;
            return Ok(());
        }
        let bytes = tokio::select! {
            result=response.chunk()=>result.map_err(network)?,
            changed=control.changed()=>{
                if changed.is_err(){checkpoint(&mut file,job,&hash,store).await?;job.state=TransferState::Paused;store.save(job)?;return Ok(());}
                continue;
            }
        };
        let Some(bytes) = bytes else { break };
        job.transferred = job.transferred.saturating_add(bytes.len() as u64);
        // Bound each file write even if a transport supplies a larger network chunk.
        for chunk in bytes.chunks(65536) {
            if budget
                .pace(&job.id, job.options.bytes_per_second, chunk.len(), control)
                .await
                .is_err()
            {
                checkpoint(&mut file, job, &hash, store).await?;
                return Err(DownloadError::InvalidState);
            }
            let next = job
                .received
                .checked_add(chunk.len() as u64)
                .ok_or(DownloadError::SizeMismatch)?;
            if job.total.is_some_and(|n| next > n) {
                return Err(DownloadError::SizeMismatch);
            }
            write_chunk(&mut file, chunk).await?;
            hash.update(chunk);
            job.received = next;
            if job.received - job.durable >= 1024 * 1024
                || last_checkpoint.elapsed() >= Duration::from_secs(1)
            {
                checkpoint(&mut file, job, &hash, store).await?;
                last_checkpoint = Instant::now();
                if parallel_hint && eligible(job) && job.durable < job.total.unwrap() {
                    drop(file);
                    drop(response);
                    drop(permit);
                    job.active_requests = 0;
                    job.ranges = ranges::plan(job.total.unwrap(), job.durable, &job.prefix_sha256)?;
                    store.save(job)?;
                    return super::segmented::transfer(client, job, control, store, budget).await;
                }
            }
        }
        if last_report.elapsed() >= Duration::from_millis(250) {
            store.progress(job);
            last_report = Instant::now();
        }
    }
    checkpoint(&mut file, job, &hash, store).await?;
    drop(file);
    finish(job, store).await
}
fn eligible(job: &Job) -> bool {
    job.options.replay_safe
        && !matches!(job.options.mode, RequestMode::Manual { requests: 1 })
        && job.etag.is_some()
        && job.total.is_some_and(|n| n >= 4 * ranges::MIN_RANGE)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn content_range_is_not_accept_ranges() {
        assert_eq!(range("bytes 50-99/100"), Some((50, 99, 100)));
        for s in ["bytes */100", "bytes 0-2/*", "items 0-2/3", "bytes x-2/3"] {
            assert_eq!(range(s), None);
        }
    }
    #[tokio::test]
    async fn injected_disk_full_does_not_ack_a_write() {
        use std::{
            io,
            pin::Pin,
            task::{Context, Poll},
        };
        struct Full;
        impl tokio::io::AsyncWrite for Full {
            fn poll_write(
                self: Pin<&mut Self>,
                _: &mut Context<'_>,
                _: &[u8],
            ) -> Poll<io::Result<usize>> {
                Poll::Ready(Err(io::Error::from_raw_os_error(if cfg!(windows) {
                    112
                } else {
                    28
                })))
            }
            fn poll_flush(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<io::Result<()>> {
                Poll::Ready(Ok(()))
            }
            fn poll_shutdown(self: Pin<&mut Self>, _: &mut Context<'_>) -> Poll<io::Result<()>> {
                Poll::Ready(Ok(()))
            }
        }
        assert_eq!(
            write_chunk(&mut Full, b"not durable").await,
            Err(DownloadError::DiskFull)
        );
    }
}
