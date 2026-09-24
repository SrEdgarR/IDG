use idg_core::download::{self, Checkpoint, Control, Job};
use idg_protocol::*;
use idg_storage::Store;
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
};
use tokio::sync::watch;
mod library;
mod organization;
mod rules;

struct Inner {
    store: Store,
    jobs: BTreeMap<String, Job>,
    active: BTreeMap<String, watch::Sender<Control>>,
    stopping: bool,
    preferences: AppPreferences,
    organization: OrganizationState,
    queue_cursor: usize,
    power_countdown: Option<idg_core::power::Countdown>,
    clock_origin: std::time::Instant,
    clipboard: idg_core::clipboard::Monitor,
    file_operations: std::collections::BTreeSet<String>,
    unavailable: BTreeMap<String, DownloadError>,
    captures: BTreeMap<String, (CaptureProposal, std::time::Instant)>,
}
#[derive(Clone)]
pub struct Downloads {
    inner: Arc<Mutex<Inner>>,
    events: watch::Sender<Option<(u32, DownloadSnapshot)>>,
    sequence: Arc<std::sync::atomic::AtomicU32>,
    resources: Arc<download::resources::Resources>,
    capture_events: watch::Sender<Option<String>>,
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
        Self::open_at(directory)
    }
    fn open_at(directory: PathBuf) -> Result<Self, DownloadError> {
        std::fs::create_dir_all(&directory).map_err(|_| DownloadError::Storage)?;
        let mut store = Store::open(&directory.join("jobs.sqlite3"))?;
        let preferences = store.preferences()?;
        let mut organization = store.organization()?.unwrap_or_else(|| {
            let mut o = OrganizationState::default();
            o.queues[0].running = preferences.queue_running;
            o
        });
        if organization.power_remaining.take().is_some() {
            organization.power_message =
                "Cuenta atrás cancelada al reiniciar el motor; requiere activar de nuevo.".into();
        }
        organization.power_simulated =
            std::env::var("IDG_POWER_ADAPTER").is_ok_and(|s| s == "simulate");
        store.save_organization(&organization, &[], None, None)?;
        let resources = download::resources::Resources::new(store.limits()?);
        let mut jobs = BTreeMap::new();
        let loaded = store.load()?;
        for mut job in loaded.jobs {
            download::recover(&mut job);
            store.save(&job)?;
            jobs.insert(job.id.clone(), job);
        }
        let (events, _) = watch::channel(None);
        let (capture_events, _) = watch::channel(None);
        let this = Self {
            inner: Arc::new(Mutex::new(Inner {
                store,
                jobs,
                active: BTreeMap::new(),
                stopping: false,
                preferences,
                organization,
                queue_cursor: 0,
                power_countdown: None,
                clock_origin: std::time::Instant::now(),
                clipboard: Default::default(),
                file_operations: Default::default(),
                unavailable: loaded.unavailable.into_iter().collect(),
                captures: BTreeMap::new(),
            })),
            events,
            resources,
            capture_events,
            sequence: Arc::new(std::sync::atomic::AtomicU32::new(0)),
        };
        {
            let mut inner = this.inner.lock().map_err(|_| DownloadError::Storage)?;
            this.pump(&mut inner);
        }
        Ok(this)
    }
    fn snapshot(&self, job: &Job) -> DownloadSnapshot {
        let mut snapshot = job.snapshot();
        snapshot.active_requests = self.resources.active_for(&job.id);
        snapshot
    }
    fn emit(&self, job: &Job) {
        let sequence = self
            .sequence
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            .wrapping_add(1);
        self.events
            .send_replace(Some((sequence, self.snapshot(job))));
    }
    pub fn subscribe(&self) -> watch::Receiver<Option<(u32, DownloadSnapshot)>> {
        self.events.subscribe()
    }
    pub fn subscribe_captures(&self) -> watch::Receiver<Option<String>> {
        self.capture_events.subscribe()
    }
    fn extension_state(&self, inner: &Inner) -> ExtensionState {
        let mut jobs = inner
            .jobs
            .values()
            .filter(|job| {
                !job.organization.private
                    && matches!(
                        job.state,
                        TransferState::Probing
                            | TransferState::Downloading
                            | TransferState::Verifying
                            | TransferState::PublishPending
                            | TransferState::Paused
                            | TransferState::Queued
                    )
            })
            .collect::<Vec<_>>();
        let active_count = jobs
            .iter()
            .filter(|job| {
                matches!(
                    job.state,
                    TransferState::Probing
                        | TransferState::Downloading
                        | TransferState::Verifying
                        | TransferState::PublishPending
                )
            })
            .count() as u32;
        jobs.sort_by_key(|job| std::cmp::Reverse(job.created_at));
        ExtensionState {
            autopick_mode: inner.preferences.autopick_mode.clone(),
            active_count,
            jobs: jobs
                .into_iter()
                .take(20)
                .map(|job| self.snapshot(job))
                .collect(),
        }
    }
    pub async fn execute(&self, request: Request) -> Payload {
        self.execute_with_role(request, false).await
    }
    pub async fn execute_extension(&self, request: Request) -> Payload {
        self.execute_with_role(request, true).await
    }
    async fn execute_with_role(&self, request: Request, extension: bool) -> Payload {
        let this = self.clone();
        match tokio::task::spawn_blocking(move || this.handle_with_role(request, extension)).await {
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
        self.handle_with_role(request, false)
    }
    fn handle_with_role(
        &self,
        request: Request,
        extension: bool,
    ) -> Result<Payload, DownloadError> {
        if extension
            && !matches!(
                request.command,
                Command::GetExtensionState
                    | Command::SetExtensionMode { .. }
                    | Command::PauseDownload { .. }
                    | Command::ResumeDownload { .. }
                    | Command::PrepareCapture { .. }
                    | Command::GetCaptureStatus { .. }
                    | Command::StartCapture { .. }
                    | Command::AbortCapture { .. }
            )
        {
            return Err(DownloadError::NotFound);
        }
        if matches!(
            &request.command,
            Command::Library {
                operation: LibraryCommand::DeleteFile { .. }
            }
        ) {
            return self.delete_file(&request);
        }
        if let Command::Library {
            operation: LibraryCommand::Bulk { ids, operation },
        } = &request.command
        {
            return self.bulk(&request, ids, operation);
        }
        let cancel = matches!(request.command, Command::CancelDownload { .. });
        let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
        if inner.stopping {
            return Err(DownloadError::Busy);
        }
        if extension
            && let Command::PauseDownload { job_id } | Command::ResumeDownload { job_id } =
                &request.command
            && inner
                .jobs
                .get(job_id)
                .is_none_or(|job| job.organization.private)
        {
            return Err(DownloadError::NotFound);
        }
        let target = match &request.command {
            Command::AddDownload { .. }
            | Command::AddDownloadWithOptions { .. }
            | Command::CreateDownload { .. } => Some(&request.id),
            Command::GetDownload { job_id }
            | Command::ResumeDownload { job_id }
            | Command::PauseDownload { job_id }
            | Command::CancelDownload { job_id }
            | Command::SetDownloadOptions { job_id, .. }
            | Command::GetDownloadRanges { job_id, .. } => Some(job_id),
            _ => None,
        };
        if let Some(error) = target.and_then(|id| inner.unavailable.get(id)) {
            return Err(error.clone());
        }
        let requested_options = match &request.command {
            Command::AddDownloadWithOptions { options, .. } => options.clone(),
            _ => TransferOptions::default(),
        };
        requested_options.validate()?;
        if let Command::Organization { operation } = &request.command {
            return self.organize(&mut inner, operation.clone(), &request);
        }
        match request.command {
            Command::GetExtensionState => Ok(Payload::ExtensionState {
                state: self.extension_state(&inner),
            }),
            Command::SetExtensionMode { mode } => {
                if !["always", "ask", "browser"].contains(&mode.as_str()) {
                    return Err(DownloadError::InvalidInput);
                }
                let mut preferences = inner.preferences.clone();
                preferences.autopick_mode = mode;
                inner.store.save_preferences(&preferences)?;
                inner.preferences = preferences;
                Ok(Payload::ExtensionState {
                    state: self.extension_state(&inner),
                })
            }
            Command::PrepareCapture { proposal } => {
                if proposal.id != request.id
                    || proposal.id.len() > 64
                    || proposal.name.is_empty()
                    || proposal.name.len() > 240
                    || !["direct", "observed"].contains(&proposal.source.as_str())
                {
                    return Err(DownloadError::InvalidInput);
                }
                let url =
                    reqwest::Url::parse(&proposal.url).map_err(|_| DownloadError::InvalidInput)?;
                if !matches!(url.scheme(), "http" | "https")
                    || url.query().is_some()
                    || url.fragment().is_some()
                    || !url.username().is_empty()
                    || url.password().is_some()
                    || proposal.url.len() > 2048
                {
                    return Err(DownloadError::InvalidInput);
                }
                download::validate_input(&NewDownload {
                    url: proposal.url.clone(),
                    name: proposal.name.clone(),
                    directory: "C:\\IDG".into(),
                    expected_sha256: None,
                    conflict: ConflictPolicy::Reject,
                })?;
                if let Some(job) = inner.jobs.get(&proposal.id) {
                    return if job.creation.as_ref().is_some_and(|c| {
                        c.context == format!("extension:{}", proposal.id)
                            && c.input.url == proposal.url
                            && c.input.name == proposal.name
                    }) {
                        Ok(Payload::CaptureStatus {
                            decision: CaptureDecision::Accepted,
                            job: Some(self.snapshot(job)),
                        })
                    } else {
                        Err(DownloadError::Conflict)
                    };
                }
                if let Some((existing, _)) = inner.captures.get(&proposal.id) {
                    return if existing.url == proposal.url
                        && existing.name == proposal.name
                        && existing.source == proposal.source
                    {
                        Ok(Payload::CaptureStatus {
                            decision: CaptureDecision::Pending,
                            job: None,
                        })
                    } else {
                        Err(DownloadError::Conflict)
                    };
                }
                inner
                    .captures
                    .retain(|_, (_, at)| at.elapsed().as_secs() < 120);
                if inner.captures.len() >= 32 {
                    return Err(DownloadError::Busy);
                }
                inner.captures.insert(
                    proposal.id.clone(),
                    (proposal.clone(), std::time::Instant::now()),
                );
                self.capture_events.send_replace(Some(proposal.id));
                Ok(Payload::CaptureStatus {
                    decision: CaptureDecision::Pending,
                    job: None,
                })
            }
            Command::GetCaptureStatus { capture_id } => {
                let decision = if inner.jobs.get(&capture_id).is_some_and(|job| {
                    job.creation
                        .as_ref()
                        .is_some_and(|c| c.context == format!("extension:{capture_id}"))
                }) {
                    CaptureDecision::Accepted
                } else if inner
                    .captures
                    .get(&capture_id)
                    .is_some_and(|(_, at)| at.elapsed().as_secs() < 120)
                {
                    CaptureDecision::Pending
                } else {
                    CaptureDecision::Rejected
                };
                let job = inner
                    .jobs
                    .get(&capture_id)
                    .filter(|job| {
                        job.creation
                            .as_ref()
                            .is_some_and(|c| c.context == format!("extension:{capture_id}"))
                    })
                    .map(|job| self.snapshot(job));
                Ok(Payload::CaptureStatus { decision, job })
            }
            Command::GetCaptureRequests => Ok(Payload::CaptureRequests {
                proposals: inner
                    .captures
                    .values()
                    .filter(|(_, at)| at.elapsed().as_secs() < 120)
                    .filter(|(proposal, _)| !inner.jobs.contains_key(&proposal.id))
                    .map(|(proposal, _)| proposal.clone())
                    .collect(),
            }),
            Command::RejectCapture { capture_id } => {
                if inner.jobs.contains_key(&capture_id) {
                    return Err(DownloadError::InvalidState);
                }
                inner.captures.remove(&capture_id);
                Ok(Payload::CaptureStatus {
                    decision: CaptureDecision::Rejected,
                    job: None,
                })
            }
            Command::StartCapture { capture_id } => {
                let job = inner
                    .jobs
                    .get(&capture_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if !job
                    .creation
                    .as_ref()
                    .is_some_and(|c| c.context == format!("extension:{capture_id}"))
                {
                    return Err(DownloadError::NotFound);
                }
                if matches!(job.state, TransferState::Failed | TransferState::Cancelled) {
                    return Err(DownloadError::InvalidState);
                }
                if job.state == TransferState::Deferred {
                    self.start(&mut inner, job.clone())?;
                }
                Ok(Payload::Download {
                    job: self.snapshot(inner.jobs.get(&capture_id).ok_or(DownloadError::NotFound)?),
                })
            }
            Command::AbortCapture { capture_id } => {
                let mut job = inner
                    .jobs
                    .get(&capture_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if !job
                    .creation
                    .as_ref()
                    .is_some_and(|c| c.context == format!("extension:{capture_id}"))
                {
                    return Err(DownloadError::NotFound);
                }
                if let Some(control) = inner.active.get(&capture_id) {
                    control.send_replace(Control::Cancel);
                } else if !matches!(
                    job.state,
                    TransferState::Cancelled | TransferState::Completed
                ) {
                    job.state = TransferState::Cancelled;
                    inner.store.save(&job)?;
                    inner.jobs.insert(capture_id, job.clone());
                    self.emit(&job);
                }
                Ok(Payload::Download {
                    job: self.snapshot(&job),
                })
            }
            Command::Library {
                operation: LibraryCommand::ClipboardStatus,
            } => {
                let pending = inner.clipboard.pending();
                Ok(Payload::ClipboardStatus {
                    id: pending.map(|p| p.id),
                    count: pending.map_or(0, |p| p.urls.len() as u32),
                    domains: pending.map(|p| p.domains.clone()).unwrap_or_default(),
                })
            }
            Command::Library {
                operation: LibraryCommand::TakeClipboard { id },
            } => {
                if !inner.organization.library.clipboard {
                    return Err(DownloadError::InvalidState);
                }
                let urls = inner.clipboard.take(id).ok_or(DownloadError::NotFound)?;
                Ok(Payload::ClipboardText {
                    text: urls.join("\n"),
                })
            }
            Command::Library {
                operation: LibraryCommand::DismissClipboard { id },
            } => {
                inner.clipboard.take(id);
                Ok(Payload::ClipboardStatus {
                    id: None,
                    count: 0,
                    domains: Vec::new(),
                })
            }
            Command::Library {
                operation: LibraryCommand::PreviewDelete { job_id },
            } => {
                let job = inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?;
                if inner.active.contains_key(&job_id) || job.state != TransferState::Completed {
                    return Err(DownloadError::InvalidState);
                }
                Ok(Payload::FileDeletionPreview {
                    path: job.final_path.clone(),
                    sha256: job
                        .calculated_sha256
                        .clone()
                        .ok_or(DownloadError::InvalidState)?,
                    bytes: job.durable.to_string(),
                })
            }
            Command::Library {
                operation: LibraryCommand::Search { query },
            } => {
                let (ids, total, next_offset) =
                    idg_core::library::search(inner.jobs.values(), &query)?;
                Ok(Payload::SearchResults {
                    ids,
                    total,
                    next_offset,
                })
            }
            Command::Library {
                operation: LibraryCommand::Duplicates { input, context },
            } => {
                download::validate_input(&input)?;
                if context.len() > 128 {
                    return Err(DownloadError::InvalidInput);
                }
                let ids = inner
                    .jobs
                    .values()
                    .filter(|j| idg_core::library::duplicate(j, &input, &context))
                    .take(100)
                    .map(|j| j.id.clone())
                    .collect();
                Ok(Payload::Duplicates { ids })
            }
            Command::FindRecoverableDownload { input } => {
                download::validate_input(&input)?;
                Ok(Payload::RecoverableDownload {
                    job_id: inner
                        .jobs
                        .values()
                        .find(|job| {
                            !inner.active.contains_key(&job.id)
                                && download::recoverable_matches(job, &input)
                        })
                        .map(|job| job.id.clone()),
                })
            }
            Command::GetDownloadDirectory { job_id } => Ok(Payload::DownloadDirectory {
                directory: download::directory_for(
                    inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?,
                )?,
            }),
            Command::GetAppPreferences => Ok(Payload::AppPreferences {
                preferences: inner.preferences.clone(),
            }),
            Command::SetAppPreferences { preferences } => {
                preferences.validate()?;
                let mut organization = inner.organization.clone();
                if let Some(main) = organization.queues.iter_mut().find(|q| q.id == "main") {
                    main.running = preferences.queue_running;
                }
                inner
                    .store
                    .save_organization(&organization, &[], Some(&preferences), None)?;
                inner.organization = organization;
                inner.preferences = preferences.clone();
                self.pump(&mut inner);
                Ok(Payload::AppPreferences { preferences })
            }
            Command::CreateDownload { mut draft } => {
                draft.validate()?;
                if let Some(job) = inner.jobs.get(&request.id) {
                    return if job.creation.as_ref() == Some(&draft) {
                        Ok(Payload::Download {
                            job: self.snapshot(job),
                        })
                    } else {
                        Err(DownloadError::Conflict)
                    };
                }
                if let Some(capture_id) = draft.context.strip_prefix("extension:") {
                    let proposal = inner
                        .captures
                        .get(capture_id)
                        .ok_or(DownloadError::NotFound)?;
                    if request.id != capture_id
                        || proposal.0.url != draft.input.url
                        || proposal.0.name != draft.input.name
                        || draft.start != StartPolicy::Later
                        || !draft.options.replay_safe
                        || proposal.1.elapsed().as_secs() >= 120
                    {
                        return Err(DownloadError::InvalidInput);
                    }
                }
                let original = draft.clone();
                if draft.apply_rules {
                    let preview = rules::preview(
                        &inner.organization,
                        &draft.input,
                        None,
                        None,
                        &draft.rule_overrides,
                    )?;
                    rules::effect_valid(&inner.organization, &preview.effect)?;
                    rules::apply(&mut draft, &preview.effect);
                    draft.validate()?;
                }
                if !inner.organization.categories.contains(&draft.category) {
                    return Err(DownloadError::InvalidInput);
                }
                if !inner
                    .organization
                    .queues
                    .iter()
                    .any(|q| q.id == draft.queue_id)
                {
                    return Err(DownloadError::InvalidInput);
                }
                let queue_limit = inner
                    .organization
                    .queues
                    .iter()
                    .find(|q| q.id == draft.queue_id)
                    .ok_or(DownloadError::InvalidInput)?
                    .concurrency as usize;
                let queue_active = inner
                    .active
                    .keys()
                    .filter(|id| {
                        inner
                            .jobs
                            .get(*id)
                            .is_some_and(|j| j.organization.queue_id == draft.queue_id)
                    })
                    .count();
                if inner.jobs.len() >= 10000
                    || (draft.start == StartPolicy::Now
                        && (inner.active.len() >= self.resources.limits().max_downloads as usize
                            || queue_active >= queue_limit))
                {
                    return Err(DownloadError::Busy);
                }
                let mut job = download::create_job(&request.id, draft.input.clone())?;
                job.organization.context = draft.context.clone();
                job.organization.private = draft.private;
                job.organization.queue_id = draft.queue_id.clone();
                job.organization.order = inner
                    .jobs
                    .values()
                    .filter(|j| j.organization.queue_id == draft.queue_id)
                    .map(|j| j.organization.order)
                    .max()
                    .unwrap_or(0)
                    .saturating_add(1);
                job.options = draft.options.clone();
                job.state = match draft.start {
                    StartPolicy::Now => TransferState::Probing,
                    StartPolicy::Later => TransferState::Deferred,
                    StartPolicy::Queue => TransferState::Queued,
                };
                job.organization.category = Some(draft.category.clone());
                job.creation = Some(original);
                if let Err(error) = inner.store.save(&job) {
                    let _ = std::fs::remove_file(&job.temporary);
                    return Err(error);
                }
                inner.jobs.insert(job.id.clone(), job.clone());
                inner.captures.remove(&job.id);
                self.emit(&job);
                if draft.start == StartPolicy::Now {
                    self.start(&mut inner, job.clone())?;
                } else {
                    self.pump(&mut inner);
                }
                Ok(Payload::Download {
                    job: self.snapshot(&job),
                })
            }
            Command::GetDownloadCapabilities => Ok(Payload::DownloadCapabilities {
                operations: [
                    "create_download",
                    "find_recoverable_download",
                    "get_app_preferences",
                    "set_app_preferences",
                    "get_download_directory",
                    "add_download",
                    "get_download",
                    "list_downloads",
                    "pause_download",
                    "resume_download",
                    "cancel_download",
                    "add_download_with_options",
                    "set_download_options",
                    "get_download_ranges",
                    "set_resource_limits",
                    "get_resource_limits",
                    "organization",
                ]
                .map(str::to_owned)
                .to_vec(),
                schema_version: 4,
                max_active: self.resources.limits().max_downloads,
                max_write_bytes: 65536,
                strong_validator_required: true,
            }),
            Command::AddDownload { input } | Command::AddDownloadWithOptions { input, .. } => {
                if let Some(job) = inner.jobs.get(&request.id) {
                    return if job.input == input && job.options == requested_options {
                        Ok(Payload::Download {
                            job: self.snapshot(job),
                        })
                    } else {
                        Err(DownloadError::Conflict)
                    };
                }
                if inner.active.len() >= self.resources.limits().max_downloads as usize {
                    return Err(DownloadError::Busy);
                }
                if inner.jobs.len() >= 10000 {
                    return Err(DownloadError::Busy);
                }
                let mut job = download::create_job(&request.id, input)?;
                job.options = requested_options;
                if let Err(error) = inner.store.save(&job) {
                    // This path was created exclusively by this request and is still empty.
                    let _ = std::fs::remove_file(&job.temporary);
                    return Err(error);
                }
                inner.jobs.insert(job.id.clone(), job.clone());
                self.start(&mut inner, job.clone())?;
                Ok(Payload::Download {
                    job: self.snapshot(&job),
                })
            }
            Command::GetDownload { job_id } => Ok(Payload::Download {
                job: self.snapshot(inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?),
            }),
            Command::ListDownloads { offset } => {
                let jobs = inner
                    .jobs
                    .values()
                    .skip(offset as usize)
                    .take(50)
                    .map(|job| self.snapshot(job))
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
                if job.state == TransferState::Deferred
                    && job.organization.context.starts_with("extension:")
                {
                    return Err(DownloadError::InvalidState);
                }
                if inner.active.contains_key(&job_id) {
                    return Ok(Payload::Download {
                        job: self.snapshot(&job),
                    });
                }
                if inner.active.len() >= self.resources.limits().max_downloads as usize {
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
                    job: self.snapshot(&job),
                })
            }
            Command::PauseDownload { job_id } | Command::CancelDownload { job_id } => {
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if let Some(control) = inner.active.get(&job_id) {
                    control.send_replace(if cancel {
                        Control::Cancel
                    } else {
                        Control::Pause
                    });
                    return Ok(Payload::Download {
                        job: self.snapshot(&job),
                    });
                }
                if matches!(
                    job.state,
                    TransferState::Completed
                        | TransferState::Cancelled
                        | TransferState::PublishPending
                ) {
                    return Ok(Payload::Download {
                        job: self.snapshot(&job),
                    });
                }
                job.state = if cancel {
                    TransferState::Cancelled
                } else {
                    TransferState::Paused
                };
                inner.store.save(&job)?;
                inner.jobs.insert(job.id.clone(), job.clone());
                self.emit(&job);
                Ok(Payload::Download {
                    job: self.snapshot(&job),
                })
            }
            Command::GetResourceLimits => Ok(Payload::ResourceLimits {
                limits: self.resources.limits(),
            }),
            Command::SetResourceLimits { limits } => {
                limits.validate()?;
                inner.store.save_limits(&limits)?;
                self.resources.update(limits.clone())?;
                self.pump(&mut inner);
                Ok(Payload::ResourceLimits { limits })
            }
            Command::SetDownloadOptions { job_id, options } => {
                options.validate()?;
                if inner.active.contains_key(&job_id) {
                    return Err(DownloadError::Busy);
                }
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                job.options = options;
                inner.store.save(&job)?;
                inner.jobs.insert(job_id, job.clone());
                self.emit(&job);
                Ok(Payload::Download {
                    job: self.snapshot(&job),
                })
            }
            Command::GetDownloadRanges { job_id, offset } => {
                let job = inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?;
                let ranges = job
                    .ranges
                    .iter()
                    .skip(offset as usize)
                    .take(50)
                    .map(|r| RangeSnapshot {
                        start: r.start.to_string(),
                        end_exclusive: r.end.to_string(),
                        durable: r.sha256.is_some(),
                    })
                    .collect();
                let next = offset.saturating_add(50);
                Ok(Payload::DownloadRanges {
                    ranges,
                    next_offset: ((next as usize) < job.ranges.len()).then_some(next),
                })
            }
            _ => Err(DownloadError::InvalidInput),
        }
    }
    fn start(&self, inner: &mut Inner, mut job: Job) -> Result<(), DownloadError> {
        let queue = inner
            .organization
            .queues
            .iter()
            .find(|q| q.id == job.organization.queue_id)
            .ok_or(DownloadError::InvalidInput)?;
        if inner
            .active
            .keys()
            .filter(|id| {
                inner
                    .jobs
                    .get(*id)
                    .is_some_and(|j| j.organization.queue_id == queue.id)
            })
            .count()
            >= queue.concurrency as usize
        {
            return Err(DownloadError::Busy);
        }
        // Persist the transition before any GET. After a crash, an already-started
        // queued job must recover paused instead of silently replaying its URL.
        if matches!(job.state, TransferState::Queued | TransferState::Deferred) {
            job.state = TransferState::Probing;
            inner.store.save(&job)?;
            inner.jobs.insert(job.id.clone(), job.clone());
            self.emit(&job);
        }
        let (control, mut commands) = watch::channel(Control::Run);
        inner.active.insert(job.id.clone(), control);
        let active_id = job.id.clone();
        let this = self.clone();
        let worker_id = active_id.clone();
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
                        rt.block_on(download::transfer_managed(
                            &client,
                            &mut job,
                            &mut commands,
                            &mut sink,
                            this.resources.clone(),
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
                    inner.active.remove(&worker_id);
                    this.pump(&mut inner);
                }
                this.emit(&job);
            })
            .map_err(|_| {
                inner.active.remove(&active_id);
                DownloadError::Busy
            })?;
        Ok(())
    }
    fn pump(&self, inner: &mut Inner) {
        if inner.stopping {
            return;
        }
        let capacity =
            (self.resources.limits().max_downloads as usize).saturating_sub(inner.active.len());
        self.pump_queues(inner, capacity);
    }
    pub async fn shutdown(&self) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.stopping = true;
            for control in inner.active.values() {
                control.send_replace(Control::Pause);
            }
        }
        loop {
            let active = self
                .inner
                .lock()
                .map(|i| !i.active.is_empty() || !i.file_operations.is_empty())
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

#[cfg(test)]
mod capture_tests {
    use super::*;

    fn req(id: &str, command: Command) -> Request {
        Request {
            version: VERSION,
            id: id.into(),
            command,
        }
    }
    #[test]
    fn capture_requires_durable_deferred_acceptance_and_replay_assertion() {
        let directory = std::env::temp_dir().join(format!(
            "idg-capture-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&directory).unwrap();
        let runtime = Downloads::open_at(directory.clone()).unwrap();
        let id = "capture-test-1";
        let proposal = CaptureProposal {
            id: id.into(),
            url: "http://example.test/file.bin".into(),
            name: "file.bin".into(),
            source: "observed".into(),
        };
        let invalid = CaptureProposal {
            id: "capture-invalid".into(),
            url: "http://example.test/file.bin?token=secret".into(),
            ..proposal.clone()
        };
        assert_eq!(
            runtime
                .handle_with_role(
                    req(
                        "capture-invalid",
                        Command::PrepareCapture { proposal: invalid }
                    ),
                    true
                )
                .unwrap_err(),
            DownloadError::InvalidInput
        );
        assert!(matches!(
            runtime
                .handle_with_role(
                    req(
                        id,
                        Command::PrepareCapture {
                            proposal: proposal.clone()
                        }
                    ),
                    true
                )
                .unwrap(),
            Payload::CaptureStatus {
                decision: CaptureDecision::Pending,
                ..
            }
        ));
        assert!(
            matches!(runtime.handle_with_role(req("list", Command::GetCaptureRequests), false).unwrap(), Payload::CaptureRequests { proposals } if proposals.len() == 1)
        );
        let mut draft = CreateDownload {
            context: format!("extension:{id}"),
            private: false,
            apply_rules: false,
            rule_overrides: vec![],
            queue_id: "main".into(),
            input: NewDownload {
                url: proposal.url,
                name: proposal.name,
                directory: directory.to_string_lossy().into_owned(),
                expected_sha256: None,
                conflict: ConflictPolicy::Reject,
            },
            options: TransferOptions::default(),
            category: "Otros".into(),
            start: StartPolicy::Later,
        };
        assert_eq!(
            runtime
                .handle_with_role(
                    req(
                        id,
                        Command::CreateDownload {
                            draft: draft.clone()
                        }
                    ),
                    true
                )
                .unwrap_err(),
            DownloadError::NotFound
        );
        assert_eq!(
            runtime
                .handle(req(
                    id,
                    Command::CreateDownload {
                        draft: draft.clone()
                    }
                ))
                .unwrap_err(),
            DownloadError::InvalidInput
        );
        draft.options.replay_safe = true;
        assert!(
            matches!(runtime.handle(req(id, Command::CreateDownload { draft: draft.clone() })).unwrap(), Payload::Download { job } if job.state == TransferState::Deferred)
        );
        assert!(matches!(
            runtime
                .handle_with_role(
                    req(
                        "status",
                        Command::GetCaptureStatus {
                            capture_id: id.into()
                        }
                    ),
                    true
                )
                .unwrap(),
            Payload::CaptureStatus {
                decision: CaptureDecision::Accepted,
                job: Some(_)
            }
        ));
        assert!(matches!(
            runtime
                .handle(req(id, Command::CreateDownload { draft }))
                .unwrap(),
            Payload::Download { .. }
        ));
        assert_eq!(
            runtime
                .handle(req(
                    "reject",
                    Command::RejectCapture {
                        capture_id: id.into()
                    }
                ))
                .unwrap_err(),
            DownloadError::InvalidState
        );
        assert!(
            matches!(runtime.handle_with_role(req("abort", Command::AbortCapture { capture_id: id.into() }), true).unwrap(), Payload::Download { job } if job.state == TransferState::Cancelled)
        );
        assert_eq!(
            runtime
                .handle_with_role(
                    req(
                        "start",
                        Command::StartCapture {
                            capture_id: id.into()
                        }
                    ),
                    true
                )
                .unwrap_err(),
            DownloadError::InvalidState
        );
        drop(runtime);
        std::fs::remove_dir_all(directory).unwrap();
    }
}
