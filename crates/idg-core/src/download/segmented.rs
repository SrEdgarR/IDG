use super::http::{header, network, range};
use super::*;
use reqwest::{Client, header::*};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    io::{Read, Seek, SeekFrom},
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    io::{AsyncSeekExt, AsyncWriteExt},
    sync::{mpsc, oneshot, watch},
    task::JoinSet,
};

enum Event {
    Started(usize, u32),
    Data {
        index: usize,
        generation: u32,
        offset: u64,
        bytes: Vec<u8>,
        ack: oneshot::Sender<()>,
    },
}
struct Failure {
    code: DownloadError,
    wait: Duration,
}
impl From<DownloadError> for Failure {
    fn from(code: DownloadError) -> Self {
        Self {
            code,
            wait: Duration::ZERO,
        }
    }
}
struct Attempt {
    offset: u64,
    hash: Sha256,
    generation: u32,
}

fn open(job: &Job) -> Result<std::fs::File, DownloadError> {
    files::ordinary(std::path::Path::new(&job.temporary))?;
    let mut options = std::fs::OpenOptions::new();
    options.read(true).write(true);
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        options.share_mode(0).custom_flags(0x00200000);
    }
    let mut file = options.open(&job.temporary).map_err(file_error)?;
    if !file.metadata().map_err(file_error)?.is_file() {
        return Err(DownloadError::PartialChanged);
    }
    for r in &job.ranges {
        if let Some(expected) = &r.sha256 {
            let actual = hash_region(&mut file, r.start, r.end)?;
            if &actual != expected {
                return Err(DownloadError::PartialChanged);
            }
        }
    }
    file.set_len(job.total.ok_or(DownloadError::InvalidRange)?)
        .map_err(file_error)?;
    Ok(file)
}
fn hash_region(file: &mut std::fs::File, start: u64, end: u64) -> Result<String, DownloadError> {
    file.seek(SeekFrom::Start(start)).map_err(file_error)?;
    let mut h = Sha256::new();
    let mut left = end - start;
    let mut b = [0; 65536];
    while left > 0 {
        let n = file
            .read(&mut b[..left.min(65536) as usize])
            .map_err(file_error)?;
        if n == 0 {
            return Err(DownloadError::PartialChanged);
        }
        h.update(&b[..n]);
        left -= n as u64;
    }
    Ok(format!("{:x}", h.finalize()))
}
struct Work {
    client: Client,
    job: Arc<Job>,
    budget: Arc<resources::Resources>,
    index: usize,
    generation: u32,
    events: mpsc::Sender<Event>,
    control: watch::Receiver<Control>,
}
impl Work {
    async fn run(mut self) -> Result<(), Failure> {
        let r = &self.job.ranges[self.index];
        let url = reqwest::Url::parse(
            self.job
                .effective_url
                .as_deref()
                .ok_or(DownloadError::UnsafeResume)?,
        )
        .map_err(|_| DownloadError::InvalidInput)?;
        let _permit = self
            .budget
            .acquire(
                &self.job.id,
                &url.origin().ascii_serialization(),
                self.job.options.priority.clone(),
                &mut self.control,
            )
            .await?;
        self.events
            .send(Event::Started(self.index, self.generation))
            .await
            .map_err(|_| DownloadError::InvalidState)?;
        let mut response = self
            .client
            .get(url.clone())
            .header(ACCEPT_ENCODING, "identity")
            .header(RANGE, format!("bytes={}-{}", r.start, r.end - 1))
            .header(
                IF_RANGE,
                self.job
                    .etag
                    .as_deref()
                    .ok_or(DownloadError::UnsafeResume)?,
            )
            .send()
            .await
            .map_err(network)?;
        let status = response.status().as_u16();
        if matches!(status, 429 | 503) {
            let wait = header(&response, RETRY_AFTER)
                .and_then(|v| {
                    v.parse::<u64>().ok().map(Duration::from_secs).or_else(|| {
                        httpdate::parse_http_date(&v).ok().map(|t| {
                            t.duration_since(std::time::SystemTime::now())
                                .unwrap_or_default()
                        })
                    })
                })
                .unwrap_or(Duration::from_secs(1));
            self.budget
                .defer_origin(&url.origin().ascii_serialization(), wait);
            return Err(Failure {
                code: DownloadError::RetryLater,
                wait,
            });
        }
        if status == 200 {
            return Err(DownloadError::RangeIgnored.into());
        }
        if status == 416 {
            return Err(DownloadError::InvalidRange.into());
        }
        if matches!(status, 401 | 403) {
            return Err(DownloadError::AccessDenied.into());
        }
        if matches!(status, 404 | 410) {
            return Err(DownloadError::Expired.into());
        }
        if status != 206 {
            return Err(DownloadError::HttpStatus.into());
        }
        if response.url() != &url
            || header(&response, ETAG) != self.job.etag
            || self
                .job
                .last_modified
                .as_ref()
                .is_some_and(|old| header(&response, LAST_MODIFIED).as_ref() != Some(old))
        {
            return Err(DownloadError::ResourceChanged.into());
        }
        if header(&response, CONTENT_ENCODING).is_some_and(|v| !v.eq_ignore_ascii_case("identity"))
        {
            return Err(DownloadError::Representation.into());
        }
        if header(&response, CONTENT_RANGE).and_then(|s| range(&s))
            != Some((r.start, r.end - 1, self.job.total.unwrap()))
            || response
                .content_length()
                .is_some_and(|n| n != r.end - r.start)
        {
            return Err(DownloadError::InvalidRange.into());
        }
        let mut offset = r.start;
        while let Some(bytes) = response.chunk().await.map_err(network)? {
            for chunk in bytes.chunks(65536) {
                if offset
                    .checked_add(chunk.len() as u64)
                    .is_none_or(|end| end > r.end)
                {
                    return Err(DownloadError::InvalidRange.into());
                }
                self.budget
                    .pace(
                        &self.job.id,
                        self.job.options.bytes_per_second,
                        chunk.len(),
                        &mut self.control,
                    )
                    .await?;
                let (ack, done) = oneshot::channel();
                self.events
                    .send(Event::Data {
                        index: self.index,
                        generation: self.generation,
                        offset,
                        bytes: chunk.to_vec(),
                        ack,
                    })
                    .await
                    .map_err(|_| DownloadError::InvalidState)?;
                done.await.map_err(|_| DownloadError::InvalidState)?;
                offset += chunk.len() as u64;
            }
        }
        if offset != r.end {
            return Err(DownloadError::SizeMismatch.into());
        }
        Ok(())
    }
}

pub(super) async fn transfer(
    client: &Client,
    job: &mut Job,
    control: &mut watch::Receiver<Control>,
    store: &mut dyn Checkpoint,
    budget: Arc<resources::Resources>,
) -> Result<(), DownloadError> {
    let total = job.total.ok_or(DownloadError::InvalidRange)?;
    if total > i64::MAX as u64 {
        return Err(DownloadError::InvalidRange);
    }
    ranges::validate(&job.ranges, total)?;
    let file = open(job)?;
    let mut file = tokio::fs::File::from_std(file);
    job.durable = ranges::durable(&job.ranges);
    job.received = job.durable;
    job.strategy = "segmented".into();
    job.state = TransferState::Downloading;
    let cap = match job.options.mode {
        RequestMode::Automatic => 8,
        RequestMode::Manual { requests } => requests,
    };
    let mut adaptive = resources::Adaptive::new(cap);
    let mut target = match job.options.mode {
        RequestMode::Automatic => adaptive.target,
        RequestMode::Manual { requests } => requests,
    };
    let mut tasks = JoinSet::new();
    let (tx, mut rx) = mpsc::channel(8);
    let mut attempts: BTreeMap<usize, Attempt> = BTreeMap::new();
    let mut generations = vec![0u32; job.ranges.len()];
    let mut retry = vec![0u32; job.ranges.len()];
    let mut highwater: Vec<u64> = job
        .ranges
        .iter()
        .map(|r| {
            if r.sha256.is_some() {
                r.end - r.start
            } else {
                0
            }
        })
        .collect();
    let mut ready = vec![Instant::now(); job.ranges.len()];
    let mut cooldown = Instant::now();
    let mut last_sample = Instant::now();
    // Opt-in, bounded numeric diagnostics; no job IDs, URLs or paths.
    let trace_enabled = cfg!(debug_assertions) && std::env::var_os("IDG_ADAPTIVE_TRACE").is_some();
    let trace_started = Instant::now();
    let mut trace_count = 0;
    let mut sample_bytes = job.received;
    let mut pressure = false;
    let mut last_report = Instant::now();
    let immutable = Arc::new(job.clone());
    store.save(job)?;
    let outcome:Result<(),DownloadError>=async {
        loop {
            if *control.borrow()!=Control::Run{return Err(DownloadError::InvalidState);}
            if job.ranges.iter().all(|r|r.sha256.is_some()){break;}
            while tasks.len()<(target as usize) && Instant::now()>=cooldown {
                let next=job.ranges.iter().enumerate().find(|(i,r)|r.sha256.is_none()&&!attempts.contains_key(i)&&Instant::now()>=ready[*i]).map(|(i,_)|i);
                let Some(index)=next else{break};generations[index]+=1;
                attempts.insert(index,Attempt{offset:job.ranges[index].start,hash:Sha256::new(),generation:generations[index]});
                let work=Work{client:client.clone(),job:immutable.clone(),budget:budget.clone(),index,generation:generations[index],events:tx.clone(),control:control.clone()};
                tasks.spawn(async move{(index,work.run().await)});
            }
            job.target_requests=target;
            tokio::select!{biased;
                _=resources::interrupted(control)=>return Err(DownloadError::InvalidState),
                Some(event)=rx.recv()=>match event {
                    Event::Started(index,generation)=>{if attempts.get(&index).is_some_and(|a|a.generation==generation){job.active_requests+=1;}}
                    Event::Data{index,generation,offset,bytes,ack}=>{
                        let Some(a)=attempts.get_mut(&index) else {continue};
                        if a.generation!=generation {continue;}
                        if a.offset!=offset||offset.checked_add(bytes.len() as u64).is_none_or(|e|e>job.ranges[index].end){return Err(DownloadError::InvalidRange);}
                        let write_at=Instant::now();
                        file.seek(SeekFrom::Start(offset)).await.map_err(file_error)?;
                        file.write_all(&bytes).await.map_err(file_error)?;
                        pressure|=write_at.elapsed()>Duration::from_millis(50);
                        a.hash.update(&bytes);a.offset+=bytes.len() as u64;
                        job.retry_not_before=None;job.retry_after_seconds=None;
                        job.transferred=job.transferred.saturating_add(bytes.len() as u64);
                        highwater[index]=highwater[index].max(a.offset-job.ranges[index].start);
                        job.received=highwater.iter().sum();
                        let _=ack.send(());
                    }
                },
                Some(done)=tasks.join_next(),if !tasks.is_empty()=>{
                    let(index,result)=done.map_err(|_|DownloadError::Network)?;
                    let a=attempts.remove(&index).ok_or(DownloadError::InvalidState)?;
                    job.active_requests=job.active_requests.saturating_sub(1);
                    match result {
                        Ok(())=>{
                            let sync_at=Instant::now();file.flush().await.map_err(file_error)?;file.sync_all().await.map_err(file_error)?;
                            pressure|=sync_at.elapsed()>Duration::from_millis(50);
                            job.ranges[index].sha256=Some(format!("{:x}",a.hash.finalize()));
                            let old=job.durable;job.durable=ranges::durable(&job.ranges);job.range_confirmed=true;
                            if let Err(e)=store.save(job){job.ranges[index].sha256=None;job.durable=old;return Err(e);}
                        }
                        Err(failure)=>{
                            pressure=true;adaptive.sample(0.0,true);target=target.min(adaptive.target);
                            if failure.code==DownloadError::RetryLater {
                                job.retry_not_before=Some(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs().saturating_add(failure.wait.as_secs()));
                            }
                            if failure.wait>Duration::from_secs(3600){return Err(failure.code);}
                            if retry[index]>=3||!matches!(failure.code,DownloadError::Network|DownloadError::Timeout|DownloadError::RetryLater){return Err(failure.code);}
                            retry[index]+=1;job.retries+=1;
                            let jitter=(index as u64*37+retry[index] as u64*53)%101;
                            let wait=Duration::from_millis((250u64<<retry[index])+jitter).max(failure.wait);
                            ready[index]=Instant::now()+wait;
                            if failure.code==DownloadError::RetryLater {cooldown=ready[index];job.retry_after_seconds=Some(wait.as_secs().min(u32::MAX as u64) as u32);}
                        }
                    }
                },
                _=tokio::time::sleep(Duration::from_millis(25))=>{}
            }
            if last_report.elapsed()>=Duration::from_millis(250){store.progress(job);last_report=Instant::now();}
            if last_sample.elapsed()>=Duration::from_secs(1){
                if matches!(job.options.mode,RequestMode::Automatic){
                    let elapsed=last_sample.elapsed().as_secs_f64();
                    let useful=job.received.saturating_sub(sample_bytes);
                    let reference=adaptive.reference();
                    let before=adaptive.target;
                    let decision=adaptive.sample(useful as f64/elapsed,pressure);target=adaptive.target;
                    if trace_enabled && trace_count<128 {
                        trace_count+=1;
                        eprintln!("IDG_ADAPTIVE {}",serde_json::json!({"at_ms":trace_started.elapsed().as_millis(),"window_ms":elapsed*1000.0,"useful_bytes":useful,"rate":useful as f64/elapsed,"reference":reference,"before":before,"target":target,"active":budget.active_for(&job.id),"decision":decision,"received":job.received,"total":total,"pressure":pressure}));
                    }
                }
                last_sample=Instant::now();sample_bytes=job.received;pressure=false;
            }
        }
        Ok(())
    }.await;
    tasks.shutdown().await;
    drop(rx);
    job.active_requests = 0;
    if let Err(error) = outcome {
        // Only this writer owns the handle. All workers are joined before it is released.
        job.received = job.durable;
        store.save(job)?;
        return Err(error);
    }
    file.flush().await.map_err(file_error)?;
    file.sync_all().await.map_err(file_error)?;
    let mut file = file.into_std().await;
    job.prefix_sha256 = hash_region(&mut file, 0, total)?;
    drop(file);
    job.received = total;
    job.durable = total;
    http::finish(job, store).await
}
