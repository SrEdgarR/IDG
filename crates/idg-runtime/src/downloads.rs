use idg_core::download::{self, Checkpoint, Control, Job};
use idg_protocol::*;
use idg_storage::Store;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::watch;

struct Inner {
    store: Store,
    jobs: BTreeMap<String, Job>,
    active: Option<(String, watch::Sender<Control>)>,
    stopping: bool,
    unavailable: BTreeMap<String, DownloadError>,
}
#[derive(Clone)]
pub struct Downloads {
    inner: Arc<Mutex<Inner>>,
    events: watch::Sender<Option<(u32, DownloadSnapshot)>>,
    sequence: Arc<std::sync::atomic::AtomicU32>,
}
impl Downloads {
    pub fn open() -> Result<Self, DownloadError> {
        // Override is local development/test configuration, never accepted over IPC.
        let directory = if let Some(path) = std::env::var_os("IDG_DATA_DIR") {
            PathBuf::from(path)
        } else {
            PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or(DownloadError::Storage)?)
                .join("IDG/development")
        };
        if !directory.is_absolute() {
            return Err(DownloadError::InvalidInput);
        }
        std::fs::create_dir_all(&directory).map_err(|_| DownloadError::Storage)?;
        let mut store = Store::open(&directory.join("jobs.sqlite3"))?;
        let mut jobs = BTreeMap::new();
        let loaded = store.load()?;
        for mut job in loaded.jobs {
            download::recover(&mut job);
            store.save(&job)?;
            jobs.insert(job.id.clone(), job);
        }
        let (events, _) = watch::channel(None);
        Ok(Self {
            inner: Arc::new(Mutex::new(Inner {
                store,
                jobs,
                active: None,
                stopping: false,
                unavailable: loaded.unavailable.into_iter().collect(),
            })),
            events,
            sequence: Arc::new(std::sync::atomic::AtomicU32::new(0)),
        })
    }
    fn emit(&self, job: &Job) {
        let sequence = self
            .sequence
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            .wrapping_add(1);
        self.events.send_replace(Some((sequence, job.snapshot())));
    }
    pub fn subscribe(&self) -> watch::Receiver<Option<(u32, DownloadSnapshot)>> {
        self.events.subscribe()
    }
    pub async fn execute(&self, request: Request) -> Payload {
        let this = self.clone();
        match tokio::task::spawn_blocking(move || this.handle(request)).await {
            Ok(Ok(p)) => p,
            Ok(Err(code)) => Payload::DownloadFailure {
                message: code.message().into(),
                code,
            },
            Err(_) => Payload::DownloadFailure {
                code: DownloadError::Storage,
                message: DownloadError::Storage.message().into(),
            },
        }
    }
    fn handle(&self, request: Request) -> Result<Payload, DownloadError> {
        let cancel = matches!(request.command, Command::CancelDownload { .. });
        let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
        if inner.stopping {
            return Err(DownloadError::Busy);
        }
        let target = match &request.command {
            Command::AddDownload { .. } => Some(&request.id),
            Command::GetDownload { job_id }
            | Command::ResumeDownload { job_id }
            | Command::PauseDownload { job_id }
            | Command::CancelDownload { job_id } => Some(job_id),
            _ => None,
        };
        if let Some(error) = target.and_then(|id| inner.unavailable.get(id)) {
            return Err(error.clone());
        }
        match request.command {
            Command::GetDownloadCapabilities => Ok(Payload::DownloadCapabilities {
                operations: [
                    "add_download",
                    "get_download",
                    "list_downloads",
                    "pause_download",
                    "resume_download",
                    "cancel_download",
                ]
                .map(str::to_owned)
                .to_vec(),
                schema_version: 1,
                max_active: 1,
                max_write_bytes: 65536,
                strong_validator_required: true,
            }),
            Command::AddDownload { input } => {
                if let Some(job) = inner.jobs.get(&request.id) {
                    return if job.input == input {
                        Ok(Payload::Download {
                            job: job.snapshot(),
                        })
                    } else {
                        Err(DownloadError::Conflict)
                    };
                }
                if inner.active.is_some() {
                    return Err(DownloadError::Busy);
                }
                if inner.jobs.len() >= 10000 {
                    return Err(DownloadError::Busy);
                }
                let job = download::create_job(&request.id, input)?;
                if let Err(error) = inner.store.save(&job) {
                    // This path was created exclusively by this request and is still empty.
                    let _ = std::fs::remove_file(&job.temporary);
                    return Err(error);
                }
                inner.jobs.insert(job.id.clone(), job.clone());
                self.start(&mut inner, job.clone())?;
                Ok(Payload::Download {
                    job: job.snapshot(),
                })
            }
            Command::GetDownload { job_id } => Ok(Payload::Download {
                job: inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .snapshot(),
            }),
            Command::ListDownloads { offset } => {
                let jobs = inner
                    .jobs
                    .values()
                    .skip(offset as usize)
                    .take(50)
                    .map(Job::snapshot)
                    .collect::<Vec<_>>();
                let next = ((offset as usize).saturating_add(50)
                    < inner.jobs.len().max(inner.unavailable.len()))
                .then_some(offset.saturating_add(50));
                Ok(Payload::Downloads {
                    unavailable: inner
                        .unavailable
                        .iter()
                        .skip(offset as usize)
                        .take(50)
                        .map(|(id, error)| UnavailableDownload {
                            id: id.clone(),
                            error: error.clone(),
                        })
                        .collect(),
                    jobs,
                    next_offset: next,
                })
            }
            Command::ResumeDownload { job_id } => {
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if inner.active.as_ref().is_some_and(|(id, _)| *id == job_id) {
                    return Ok(Payload::Download {
                        job: job.snapshot(),
                    });
                }
                if inner.active.is_some() {
                    return Err(DownloadError::Busy);
                }
                if matches!(
                    job.state,
                    TransferState::Completed | TransferState::Cancelled
                ) {
                    return Err(DownloadError::InvalidState);
                }
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                if job.retry_not_before.is_some_and(|deadline| now < deadline) {
                    return Err(DownloadError::RetryLater);
                }
                job.retry_not_before = None;
                job.retry_after_seconds = None;
                job.error = None;
                self.start(&mut inner, job.clone())?;
                Ok(Payload::Download {
                    job: job.snapshot(),
                })
            }
            Command::PauseDownload { job_id } | Command::CancelDownload { job_id } => {
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if let Some((id, control)) = &inner.active
                    && *id == job_id
                {
                    control.send_replace(if cancel {
                        Control::Cancel
                    } else {
                        Control::Pause
                    });
                    return Ok(Payload::Download {
                        job: job.snapshot(),
                    });
                }
                if matches!(
                    job.state,
                    TransferState::Completed
                        | TransferState::Cancelled
                        | TransferState::PublishPending
                ) {
                    return Ok(Payload::Download {
                        job: job.snapshot(),
                    });
                }
                job.state = if cancel {
                    TransferState::Cancelled
                } else {
                    TransferState::Paused
                };
                inner.store.save(&job)?;
                inner.jobs.insert(job.id.clone(), job.clone());
                Ok(Payload::Download {
                    job: job.snapshot(),
                })
            }
            _ => Err(DownloadError::InvalidInput),
        }
    }
    fn start(&self, inner: &mut Inner, mut job: Job) -> Result<(), DownloadError> {
        let (control, mut commands) = watch::channel(Control::Run);
        inner.active = Some((job.id.clone(), control));
        let this = self.clone();
        std::thread::Builder::new()
            .name("idg-transfer".into())
            .spawn(move || {
                let mut sink = Sink(this.clone());
                let result = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|_| DownloadError::Network)
                    .and_then(|rt| {
                        let client = download::client()?;
                        rt.block_on(download::transfer(
                            &client,
                            &mut job,
                            &mut commands,
                            &mut sink,
                        ))
                    });
                if let Err(error) = result {
                    if job.state != TransferState::PublishPending {
                        job.state = TransferState::Failed;
                    }
                    job.error = Some(error);
                    let _ = sink.save(&job);
                }
                if let Ok(mut inner) = this.inner.lock() {
                    inner.jobs.insert(job.id.clone(), job.clone());
                    inner.active = None;
                }
                this.emit(&job);
            })
            .map_err(|_| {
                inner.active = None;
                DownloadError::Busy
            })?;
        Ok(())
    }
    pub async fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.stopping = true;
            if let Some((_, control)) = &inner.active {
                control.send_replace(Control::Pause);
            }
        }
        loop {
            let active = self
                .inner
                .lock()
                .map(|i| i.active.is_some())
                .unwrap_or(false);
            if !active {
                break;
            }
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
        }
    }
}
struct Sink(Downloads);
impl Checkpoint for Sink {
    fn save(&mut self, job: &Job) -> Result<(), DownloadError> {
        let mut inner = self.0.inner.lock().map_err(|_| DownloadError::Storage)?;
        inner.store.save(job)?;
        inner.jobs.insert(job.id.clone(), job.clone());
        self.0.emit(job);
        Ok(())
    }
    fn progress(&mut self, job: &Job) {
        if let Ok(mut inner) = self.0.inner.lock() {
            inner.jobs.insert(job.id.clone(), job.clone());
            self.0.emit(job);
        }
    }
}
