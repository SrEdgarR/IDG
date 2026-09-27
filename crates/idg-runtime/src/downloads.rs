use idg_core::download::{self, Checkpoint, Control, Job};
use idg_protocol::*;
use idg_storage::Store;
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex, Weak},
};
use tokio::sync::watch;
mod library;
mod organization;
mod rules;

fn file_presence(path: &std::path::Path) -> FilePresence {
    #[cfg(windows)]
    {
        idg_platform_windows::files::presence(path)
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        FilePresence::Unknown
    }
}

fn attachment_source_origin(raw: &str) -> Option<String> {
    let url = reqwest::Url::parse(raw).ok()?;
    matches!(url.scheme(), "http" | "https" | "ftp" | "ftps")
        .then(|| url.origin().ascii_serialization())
        .filter(|origin| origin != "null")
}

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
    pending_media: BTreeMap<String, idg_core::download::MediaTask>,
}
struct FileWatcherState {
    watcher: Option<RecommendedWatcher>,
    directories: std::collections::BTreeSet<PathBuf>,
}
#[derive(Clone)]
pub struct Downloads {
    inner: Arc<Mutex<Inner>>,
    events: watch::Sender<Option<(u32, DownloadSnapshot)>>,
    sequence: Arc<std::sync::atomic::AtomicU32>,
    resources: Arc<download::resources::Resources>,
    capture_events: watch::Sender<Option<String>>,
    file_watcher: Arc<Mutex<FileWatcherState>>,
}

fn publish_snapshot(
    events: &watch::Sender<Option<(u32, DownloadSnapshot)>>,
    sequence: &std::sync::atomic::AtomicU32,
    snapshot: DownloadSnapshot,
) {
    let sequence = sequence
        .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        .wrapping_add(1);
    events.send_replace(Some((sequence, snapshot)));
}

fn same_path(left: &std::path::Path, right: &std::path::Path) -> bool {
    fn normalized(path: &std::path::Path) -> String {
        let value = path.to_string_lossy().replace('/', "\\");
        let Some(rest) = value.strip_prefix(r"\\?\") else {
            return value;
        };
        let bytes = rest.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && bytes[2] == b'\\'
        {
            rest.to_owned()
        } else {
            value
        }
    }
    normalized(left).eq_ignore_ascii_case(&normalized(right))
}

fn same_path_or_parent(event_path: &std::path::Path, job_path: &std::path::Path) -> bool {
    same_path(event_path, job_path)
        || job_path
            .parent()
            .is_some_and(|parent| same_path(event_path, parent))
        || event_path
            .parent()
            .zip(job_path.parent())
            .is_some_and(|(event_parent, job_parent)| same_path(event_parent, job_parent))
}

#[cfg(test)]
mod file_watcher_tests {
    use super::{same_path, same_path_or_parent};
    use std::path::Path;

    #[test]
    fn watcher_paths_match_extended_and_regular_local_drive_names() {
        assert!(same_path(
            Path::new(r"\\?\C:\Downloads\file.bin"),
            Path::new(r"c:\downloads\file.bin")
        ));
        assert!(same_path(
            Path::new(r"C:/Downloads/file.bin"),
            Path::new(r"c:\downloads\file.bin")
        ));
        assert!(same_path_or_parent(
            Path::new(r"C:\Downloads\another-file.bin"),
            Path::new(r"\\?\c:\downloads\file.bin")
        ));
        assert!(!same_path_or_parent(
            Path::new(r"C:\Other\another-file.bin"),
            Path::new(r"\\?\c:\downloads\file.bin")
        ));
    }
}

fn new_file_watcher(
    inner: Weak<Mutex<Inner>>,
    events: watch::Sender<Option<(u32, DownloadSnapshot)>>,
    sequence: Arc<std::sync::atomic::AtomicU32>,
) -> FileWatcherState {
    let watcher = notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
        let Ok(event) = result else { return };
        if matches!(event.kind, EventKind::Access(_)) || event.paths.is_empty() {
            return;
        }
        let Some(inner) = inner.upgrade() else { return };
        let jobs = {
            let Ok(inner) = inner.lock() else { return };
            inner
                .jobs
                .values()
                .filter(|job| {
                    !job.organization.private
                        && job.state == TransferState::Completed
                        && event.paths.iter().any(|path| {
                            same_path_or_parent(path, std::path::Path::new(&job.final_path))
                        })
                })
                .cloned()
                .collect::<Vec<_>>()
        };
        for job in jobs {
            let mut snapshot = job.snapshot();
            snapshot.file_presence = file_presence(std::path::Path::new(&job.final_path));
            publish_snapshot(&events, &sequence, snapshot);
        }
    });
    FileWatcherState {
        watcher: watcher.ok(),
        directories: Default::default(),
    }
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
        let inner = Arc::new(Mutex::new(Inner {
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
            pending_media: BTreeMap::new(),
        }));
        let sequence = Arc::new(std::sync::atomic::AtomicU32::new(0));
        let file_watcher = Arc::new(Mutex::new(new_file_watcher(
            Arc::downgrade(&inner),
            events.clone(),
            sequence.clone(),
        )));
        let this = Self {
            inner,
            events,
            resources,
            capture_events,
            sequence,
            file_watcher,
        };
        let watch_directories = this
            .inner
            .lock()
            .map(|inner| {
                inner
                    .jobs
                    .values()
                    .filter(|job| {
                        !job.organization.private && job.state == TransferState::Completed
                    })
                    .filter_map(|job| {
                        std::path::Path::new(&job.final_path)
                            .parent()
                            .map(PathBuf::from)
                    })
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        for directory in watch_directories {
            this.watch_directory(&directory);
        }
        {
            let mut inner = this.inner.lock().map_err(|_| DownloadError::Storage)?;
            this.pump(&mut inner);
        }
        Ok(this)
    }
    fn snapshot(&self, job: &Job) -> DownloadSnapshot {
        let mut snapshot = job.snapshot();
        snapshot.active_requests = self.resources.active_for(&job.id);
        if !job.organization.private && job.state == TransferState::Completed {
            snapshot.file_presence = file_presence(std::path::Path::new(&job.final_path));
        }
        snapshot
    }
    fn watch_directory(&self, directory: &std::path::Path) {
        const MAX_WATCHED_DIRECTORIES: usize = 64;
        #[cfg(windows)]
        let safe = idg_platform_windows::files::watchable_directory(directory);
        #[cfg(not(windows))]
        let safe = false;
        if !safe {
            return;
        }
        let Ok(directory) = std::fs::canonicalize(directory) else {
            return;
        };
        let Ok(mut state) = self.file_watcher.lock() else {
            return;
        };
        if state.directories.contains(&directory)
            || state.directories.len() >= MAX_WATCHED_DIRECTORIES
        {
            return;
        }
        if state.watcher.as_mut().is_some_and(|watcher| {
            watcher
                .watch(&directory, RecursiveMode::NonRecursive)
                .is_ok()
        }) {
            state.directories.insert(directory);
        }
    }
    fn emit(&self, job: &Job) {
        if !job.organization.private
            && job.state == TransferState::Completed
            && let Some(directory) = std::path::Path::new(&job.final_path).parent()
        {
            self.watch_directory(directory);
        }
        publish_snapshot(&self.events, &self.sequence, self.snapshot(job));
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
                            | TransferState::Processing
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
                        | TransferState::Processing
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
        if matches!(
            &request.command,
            Command::InspectMediaManifest { .. } | Command::CreateMediaDownload { .. }
        ) {
            return match self.execute_media_command(request, extension).await {
                Ok(payload) => payload,
                Err(code) => Payload::DownloadFailure {
                    message: code.message().into(),
                    code,
                },
            };
        }
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
    async fn execute_media_command(
        &self,
        request: Request,
        extension: bool,
    ) -> Result<Payload, DownloadError> {
        if extension || request.version != VERSION {
            return Err(DownloadError::NotFound);
        }
        match request.command {
            Command::InspectMediaManifest { url } => {
                let proxy = self
                    .inner
                    .lock()
                    .map_err(|_| DownloadError::Storage)?
                    .preferences
                    .proxy
                    .clone();
                let client = download::client_with_policy(&proxy)?;
                let plan = idg_media::inspect_manifest(&client, &url, &self.resources, &request.id)
                    .await?;
                Ok(Payload::MediaPlan { plan })
            }
            Command::CreateMediaDownload {
                draft,
                fingerprint,
                selection,
            } => {
                draft.validate()?;
                let existing = (|| {
                    let inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
                    if inner.preferences.media_ffmpeg_path.is_none() {
                        return Err(DownloadError::MediaToolUnavailable);
                    }
                    if let Some(job) = inner.jobs.get(&request.id) {
                        let same = job.creation.as_ref() == Some(&draft)
                            && job.media.as_ref().is_some_and(|task| {
                                task.fingerprint == fingerprint && task.selection == selection
                            });
                        return if same {
                            Ok(Some(Payload::Download {
                                job: self.snapshot(job),
                            }))
                        } else {
                            Err(DownloadError::Conflict)
                        };
                    }
                    Ok(None)
                })()?;
                if let Some(payload) = existing {
                    return Ok(payload);
                }
                let proxy = {
                    let inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
                    draft
                        .options
                        .proxy
                        .clone()
                        .unwrap_or_else(|| inner.preferences.proxy.clone())
                };
                let client = download::client_with_policy(&proxy)?;
                let media = idg_media::prepare_selection(
                    &client,
                    &draft.input.url,
                    &fingerprint,
                    &selection,
                    &self.resources,
                    &request.id,
                )
                .await?;
                {
                    let mut inner = self.inner.lock().map_err(|_| DownloadError::Storage)?;
                    if inner.stopping {
                        return Err(DownloadError::Busy);
                    }
                    if let Some(existing) = inner.pending_media.get(&request.id) {
                        if existing.fingerprint != media.fingerprint
                            || existing.selection != media.selection
                        {
                            return Err(DownloadError::Conflict);
                        }
                    } else {
                        inner.pending_media.insert(request.id.clone(), media);
                    }
                }
                let this = self.clone();
                let request_id = request.id.clone();
                let command = Request {
                    version: request.version,
                    id: request.id,
                    command: Command::CreateDownload { draft },
                };
                let result = match tokio::task::spawn_blocking(move || this.handle(command)).await {
                    Ok(result) => result,
                    Err(_) => Err(DownloadError::Storage),
                };
                if let Ok(mut inner) = self.inner.lock() {
                    inner.pending_media.remove(&request_id);
                }
                result
            }
            _ => Err(DownloadError::InvalidInput),
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
        if matches!(
            &request.command,
            Command::Library {
                operation: LibraryCommand::LocateFile { .. }
            }
        ) {
            return self.locate_file(&request);
        }
        if matches!(
            &request.command,
            Command::Library {
                operation: LibraryCommand::InspectFileSecurity { .. }
            }
        ) {
            return self.inspect_file_security(&request);
        }
        if matches!(
            &request.command,
            Command::Library {
                operation: LibraryCommand::ClearHistoryMetadata
            }
        ) {
            return self.clear_history_metadata(&request);
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
        let mut requested_options = match &request.command {
            Command::AddDownloadWithOptions { options, .. } => options.clone(),
            _ => TransferOptions::default(),
        };
        if matches!(
            request.command,
            Command::AddDownload { .. } | Command::AddDownloadWithOptions { .. }
        ) && requested_options.proxy.is_none()
        {
            requested_options.proxy = Some(inner.preferences.proxy.clone());
        }
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
                    || !["direct", "observed", "media"].contains(&proposal.source.as_str())
                    || (proposal.source == "media" && proposal.media.is_none())
                    || (proposal.source != "media" && proposal.media.is_some())
                {
                    return Err(DownloadError::InvalidInput);
                }
                if let Some(media) = &proposal.media {
                    media.validate()?;
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
                    auth: None,
                    allow_cleartext_ftp: false,
                })?;
                if let Some(job) = inner.jobs.get(&proposal.id) {
                    return if job.creation.as_ref().is_some_and(|c| {
                        c.context == format!("extension:{}", proposal.id)
                            && c.input.url == proposal.url
                            && c.input.name == proposal.name
                    }) && job.organization.media == proposal.media
                    {
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
                        && existing.media == proposal.media
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
                if job.organization.private
                    || inner.active.contains_key(&job_id)
                    || job.state != TransferState::Completed
                {
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
                    .filter(|job| !job.organization.private)
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
                                && !job.organization.private
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
                if inner.unavailable.contains_key(&request.id) {
                    return Err(DownloadError::Conflict);
                }
                if let Some(job) = inner.jobs.get(&request.id).cloned() {
                    let pending_media = inner.pending_media.remove(&request.id);
                    return if job.creation.as_ref() == Some(&draft)
                        && match pending_media.as_ref() {
                            Some(media) => job.media.as_ref().is_some_and(|saved| {
                                saved.fingerprint == media.fingerprint
                                    && saved.selection == media.selection
                            }),
                            None => job.media.is_none(),
                        } {
                        Ok(Payload::Download {
                            job: self.snapshot(&job),
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
                if draft.options.proxy.is_none() {
                    draft.options.proxy = Some(inner.preferences.proxy.clone());
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
                job.media = inner.pending_media.remove(&request.id);
                if let Some(capture_id) = draft.context.strip_prefix("extension:") {
                    job.organization.media = inner
                        .captures
                        .get(capture_id)
                        .and_then(|(proposal, _)| proposal.media.clone());
                }
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
        let inherited_proxy = job.options.proxy.is_none();
        if inherited_proxy {
            job.options.proxy = Some(inner.preferences.proxy.clone());
        }
        let media_tools = if job.media.is_some() {
            let ffmpeg = inner
                .preferences
                .media_ffmpeg_path
                .as_ref()
                .map(PathBuf::from)
                .ok_or(DownloadError::MediaToolUnavailable)?;
            let ffprobe_name = if cfg!(windows) {
                "ffprobe.exe"
            } else {
                "ffprobe"
            };
            Some(idg_media::ffmpeg::Tools {
                ffprobe: ffmpeg.with_file_name(ffprobe_name),
                ffmpeg,
            })
        } else {
            None
        };
        // Persist the transition before any GET. After a crash, an already-started
        // queued job must recover paused instead of silently replaying its URL.
        let pending_state = matches!(job.state, TransferState::Queued | TransferState::Deferred);
        if pending_state {
            job.state = TransferState::Probing;
        }
        if pending_state || inherited_proxy {
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
                let media_tools = media_tools;
                let result = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|_| DownloadError::Network)
                    .and_then(|rt| {
                        if job.media.is_some() {
                            let policy = job
                                .options
                                .proxy
                                .as_ref()
                                .ok_or(DownloadError::InvalidInput)?;
                            let client = download::client_with_policy(policy)?;
                            let tools = media_tools.ok_or(DownloadError::MediaToolUnavailable)?;
                            rt.block_on(idg_media::transfer_media(
                                &client,
                                &mut job,
                                &mut commands,
                                &mut sink,
                                this.resources.clone(),
                                &tools,
                            ))
                        } else if job.input.url.split_once(':').is_some_and(|(scheme, _)| {
                            scheme.eq_ignore_ascii_case("ftp")
                                || scheme.eq_ignore_ascii_case("ftps")
                        }) {
                            rt.block_on(download::transfer_ftp_managed(
                                &mut job,
                                &mut commands,
                                &mut sink,
                                this.resources.clone(),
                            ))
                        } else {
                            let policy = job
                                .options
                                .proxy
                                .as_ref()
                                .ok_or(DownloadError::InvalidInput)?;
                            let client = download::client_with_policy(policy)?;
                            rt.block_on(download::transfer_managed(
                                &client,
                                &mut job,
                                &mut commands,
                                &mut sink,
                                this.resources.clone(),
                            ))
                        }
                    });
                #[cfg(windows)]
                if result.is_ok() && job.state == TransferState::Completed {
                    let source = attachment_source_origin(&job.input.url);
                    let _ = idg_platform_windows::files::apply_attachment_mark(
                        std::path::Path::new(&job.final_path),
                        source.as_deref(),
                    );
                }
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
    use std::{
        path::Path,
        sync::atomic::{AtomicU64, Ordering},
    };

    #[test]
    fn attachment_source_omits_path_query_and_credentials() {
        assert_eq!(
            attachment_source_origin("https://user:pass@example.test:8443/file?token=secret#part"),
            Some("https://example.test:8443".into())
        );
        assert_eq!(attachment_source_origin("file:///C:/secret"), None);
    }

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let root = std::env::temp_dir();
            for _ in 0..100 {
                let nonce = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos();
                let sequence = NEXT.fetch_add(1, Ordering::Relaxed);
                let path = root.join(format!(
                    "idg-runtime-rust-test-{}-{nonce}-{sequence}",
                    std::process::id()
                ));
                match std::fs::create_dir(&path) {
                    Ok(()) => return Self(path),
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
                    Err(error) => panic!("cannot create test directory: {error}"),
                }
            }
            panic!("could not allocate a unique test directory")
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    fn create_draft(directory: &Path, private: bool, start: StartPolicy) -> CreateDownload {
        CreateDownload {
            context: "manual".into(),
            private,
            apply_rules: false,
            rule_overrides: Vec::new(),
            queue_id: "main".into(),
            input: NewDownload {
                url: "https://example.test/file.bin".into(),
                directory: directory.to_string_lossy().into_owned(),
                name: if private { "private.bin" } else { "public.bin" }.into(),
                expected_sha256: None,
                conflict: ConflictPolicy::Reject,
                auth: None,
                allow_cleartext_ftp: false,
            },
            options: TransferOptions::default(),
            category: "Otros".into(),
            start,
        }
    }

    #[tokio::test]
    async fn watcher_publishes_missing_state_after_a_completed_file_moves() {
        let directory = TestDirectory::new();
        let files = directory.path().join("files");
        std::fs::create_dir(&files).unwrap();
        let moved_directory = directory.path().join("relocated");
        std::fs::create_dir(&moved_directory).unwrap();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let content = b"watcher reconciliation fixture";
        let mut job = download::create_job(
            "watcher-reconcile",
            NewDownload {
                url: "http://127.0.0.1/file.bin".into(),
                name: "file.bin".into(),
                directory: files.to_string_lossy().into_owned(),
                expected_sha256: None,
                conflict: ConflictPolicy::Reject,
                auth: None,
                allow_cleartext_ftp: false,
            },
        )
        .unwrap();
        std::fs::write(&job.final_path, content).unwrap();
        job.state = TransferState::Completed;
        job.received = content.len() as u64;
        job.durable = content.len() as u64;
        job.transferred = content.len() as u64;
        job.total = Some(content.len() as u64);
        let original = Path::new(&job.final_path).to_path_buf();
        {
            let mut inner = runtime.inner.lock().unwrap();
            inner.store.save(&job).unwrap();
            inner.jobs.insert(job.id.clone(), job.clone());
        }
        runtime.watch_directory(original.parent().unwrap());
        let mut events = runtime.subscribe();
        std::fs::rename(&original, moved_directory.join("file.bin")).unwrap();

        tokio::time::timeout(std::time::Duration::from_secs(3), events.changed())
            .await
            .expect("file watcher did not publish the rename")
            .unwrap();
        let (sequence, snapshot) = events.borrow_and_update().clone().unwrap();
        assert!(sequence > 0);
        assert_eq!(snapshot.id, job.id);
        assert_eq!(snapshot.file_presence, FilePresence::Missing);
        runtime.shutdown().await;
    }

    #[tokio::test]
    async fn global_proxy_routes_http_download_through_the_configured_proxy() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};

        let proxy = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let proxy_addr = proxy.local_addr().unwrap();
        let proxy_request = tokio::spawn(async move {
            let (mut stream, _) = proxy.accept().await.unwrap();
            let mut request = Vec::new();
            let mut chunk = [0; 1024];
            loop {
                let count = stream.read(&mut chunk).await.unwrap();
                assert_ne!(count, 0, "proxy connection ended before request headers");
                request.extend_from_slice(&chunk[..count]);
                if request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            assert!(
                request.starts_with(b"GET http://example.invalid/file "),
                "request did not use the configured proxy: {}",
                String::from_utf8_lossy(&request)
            );
            stream
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 4\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\ndata")
                .await
                .unwrap();
        });
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let policy = ProxyPolicy::Explicit {
            url: format!("http://{proxy_addr}"),
        };
        let preferences = AppPreferences {
            proxy: policy.clone(),
            ..AppPreferences::default()
        };
        runtime
            .handle(req(
                "preferences",
                Command::SetAppPreferences { preferences },
            ))
            .unwrap();

        let mut draft = create_draft(directory.path(), false, StartPolicy::Now);
        draft.input.url = "http://example.invalid/file".into();
        draft.input.expected_sha256 =
            Some("3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7".into());
        let Payload::Download { job } = runtime
            .handle(req("global-proxy", Command::CreateDownload { draft }))
            .unwrap()
        else {
            panic!("expected a started download");
        };
        assert_eq!(job.options.proxy, Some(policy));
        let mut result = job;
        for _ in 0..100 {
            tokio::time::sleep(std::time::Duration::from_millis(25)).await;
            let Payload::Download { job } = runtime
                .handle(req(
                    "status",
                    Command::GetDownload {
                        job_id: "global-proxy".into(),
                    },
                ))
                .unwrap()
            else {
                panic!("expected a download status");
            };
            if job.state == TransferState::Completed || job.state == TransferState::Failed {
                result = job;
                break;
            }
        }
        assert_eq!(result.state, TransferState::Completed, "{:?}", result.error);
        assert!(result.verified_against_reference);
        proxy_request.await.unwrap();
        runtime.shutdown().await;
    }

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
            media: None,
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
                auth: None,
                allow_cleartext_ftp: false,
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

    #[test]
    fn accepted_direct_media_saves_sanitized_metadata_with_the_job() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let id = "media-capture-1";
        let metadata = MediaMetadata {
            kind: MediaKind::Video,
            title: "Local fixture".into(),
            mime_type: Some("video/mp4".into()),
            width: Some(640),
            height: Some(360),
            frame_rate_milli: None,
            video_codec: None,
            audio_codec: None,
            video_tracks: None,
            audio_tracks: None,
            duration_ms: Some("14500".into()),
            size_bytes: Some("8192".into()),
            size_kind: MediaSizeKind::Exact,
            manifest_kind: MediaManifestKind::None,
        };
        let proposal = CaptureProposal {
            id: id.into(),
            url: "http://127.0.0.1:8788/clip.mp4".into(),
            name: "clip.mp4".into(),
            source: "media".into(),
            media: Some(metadata.clone()),
        };
        for invalid in [
            CaptureProposal {
                media: None,
                id: "media-missing-info".into(),
                ..proposal.clone()
            },
            CaptureProposal {
                source: "direct".into(),
                id: "media-source-mismatch".into(),
                ..proposal.clone()
            },
            CaptureProposal {
                id: "manifest-not-downloadable".into(),
                media: Some(MediaMetadata {
                    manifest_kind: MediaManifestKind::Hls,
                    ..metadata.clone()
                }),
                ..proposal.clone()
            },
        ] {
            let invalid_id = invalid.id.clone();
            assert_eq!(
                runtime
                    .handle(req(
                        &invalid_id,
                        Command::PrepareCapture { proposal: invalid }
                    ))
                    .unwrap_err(),
                DownloadError::InvalidInput
            );
        }
        runtime
            .handle(req(
                id,
                Command::PrepareCapture {
                    proposal: proposal.clone(),
                },
            ))
            .unwrap();
        assert!(
            runtime
                .inner
                .lock()
                .unwrap()
                .store
                .load()
                .unwrap()
                .jobs
                .is_empty()
        );

        let mut draft = create_draft(directory.path(), false, StartPolicy::Later);
        draft.context = format!("extension:{id}");
        draft.input.url = proposal.url;
        draft.input.name = proposal.name;
        draft.options.replay_safe = true;
        draft.category = "Videos".into();
        runtime
            .handle(req(id, Command::CreateDownload { draft }))
            .unwrap();
        let stored = runtime.inner.lock().unwrap().store.load().unwrap();
        assert_eq!(stored.jobs.len(), 1);
        assert_eq!(stored.jobs[0].organization.media, Some(metadata.clone()));

        drop(runtime);
        let recovered = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        assert_eq!(
            recovered.inner.lock().unwrap().jobs[id].organization.media,
            Some(metadata)
        );
    }

    #[test]
    fn extension_cannot_enumerate_or_mutate_private_history() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        for (id, draft) in [
            (
                "private-job",
                create_draft(directory.path(), true, StartPolicy::Later),
            ),
            (
                "public-job",
                create_draft(directory.path(), false, StartPolicy::Queue),
            ),
        ] {
            runtime
                .handle(req(
                    id,
                    Command::CreateDownload {
                        draft: draft.clone(),
                    },
                ))
                .unwrap();
        }

        let extension = runtime
            .handle_with_role(req("state", Command::GetExtensionState), true)
            .unwrap();
        assert!(
            matches!(extension, Payload::ExtensionState { state } if state.active_count == 0 && state.jobs.len() == 1 && state.jobs[0].id == "public-job")
        );
        for command in [
            Command::PauseDownload {
                job_id: "private-job".into(),
            },
            Command::ResumeDownload {
                job_id: "private-job".into(),
            },
            Command::Library {
                operation: LibraryCommand::InspectFileSecurity {
                    job_id: "private-job".into(),
                },
            },
        ] {
            assert!(matches!(
                runtime.handle_with_role(req("private-access", command), true),
                Err(DownloadError::NotFound)
            ));
        }
        assert!(matches!(
            runtime.handle_with_role(req("history", Command::ListDownloads { offset: 0 }), true),
            Err(DownloadError::NotFound)
        ));
    }

    #[test]
    fn private_download_is_session_only_and_excluded_from_search_and_receipts() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        runtime
            .handle(req(
                "private-session-job",
                Command::CreateDownload {
                    draft: create_draft(directory.path(), true, StartPolicy::Later),
                },
            ))
            .unwrap();
        assert!(matches!(
            runtime.handle(req(
                "private-list",
                Command::ListDownloads { offset: 0 }
            )),
            Ok(Payload::Downloads { jobs, .. }) if jobs.len() == 1 && jobs[0].private
        ));
        let recoverable = runtime
            .handle(req(
                "private-recovery-query",
                Command::FindRecoverableDownload {
                    input: create_draft(directory.path(), false, StartPolicy::Later).input,
                },
            ))
            .unwrap();
        assert!(matches!(
            recoverable,
            Payload::RecoverableDownload { job_id: None }
        ));
        let hidden = runtime.handle(req(
            "private-search",
            Command::Library {
                operation: LibraryCommand::Search {
                    query: SearchQuery {
                        text: "private.bin".into(),
                        ..Default::default()
                    },
                },
            },
        ));
        assert!(matches!(
            hidden,
            Ok(Payload::SearchResults { total: 0, .. })
        ));
        let bulk = req(
            "private-bulk",
            Command::Library {
                operation: LibraryCommand::Bulk {
                    ids: vec!["private-session-job".into()],
                    operation: BulkAction::Hide,
                },
            },
        );
        assert!(matches!(
            runtime.handle(bulk.clone()),
            Err(DownloadError::NotFound)
        ));
        assert!(
            runtime
                .inner
                .lock()
                .unwrap()
                .store
                .receipt(&bulk)
                .unwrap()
                .is_none()
        );
        assert!(
            runtime
                .inner
                .lock()
                .unwrap()
                .store
                .load()
                .unwrap()
                .jobs
                .is_empty()
        );
        drop(runtime);
        let reopened = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        assert!(matches!(
            reopened.handle(req("after-restart", Command::ListDownloads { offset: 0 })),
            Ok(Payload::Downloads { jobs, .. }) if jobs.is_empty()
        ));
    }

    #[tokio::test]
    async fn history_metadata_cleanup_removes_only_terminal_records_and_keeps_files() {
        let directory = TestDirectory::new();
        let files = directory.path().join("files");
        std::fs::create_dir(&files).unwrap();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let completed_file = files.join("completed.bin");
        let mut completed = download::create_job(
            "completed-history",
            NewDownload {
                url: "https://example.test/completed".into(),
                directory: files.to_string_lossy().into_owned(),
                name: "completed.bin".into(),
                expected_sha256: None,
                conflict: ConflictPolicy::Reject,
                auth: None,
                allow_cleartext_ftp: false,
            },
        )
        .unwrap();
        std::fs::write(&completed_file, b"keep the downloaded file").unwrap();
        completed.state = TransferState::Completed;
        completed.received = 24;
        completed.durable = 24;
        completed.transferred = 24;
        completed.total = Some(24);
        let mut cancelled = download::create_job(
            "cancelled-history",
            NewDownload {
                url: "https://example.test/cancelled".into(),
                name: "cancelled.bin".into(),
                ..completed.input.clone()
            },
        )
        .unwrap();
        cancelled.state = TransferState::Cancelled;
        let mut failed = download::create_job(
            "failed-history",
            NewDownload {
                url: "https://example.test/failed".into(),
                name: "failed.bin".into(),
                ..completed.input.clone()
            },
        )
        .unwrap();
        failed.state = TransferState::Failed;
        let mut paused = download::create_job(
            "paused-history",
            NewDownload {
                url: "https://example.test/paused".into(),
                name: "paused.bin".into(),
                ..completed.input.clone()
            },
        )
        .unwrap();
        paused.state = TransferState::Paused;
        let mut private = download::create_job(
            "private-history",
            NewDownload {
                url: "https://example.test/private".into(),
                name: "private.bin".into(),
                ..completed.input.clone()
            },
        )
        .unwrap();
        private.organization.private = true;
        private.state = TransferState::Completed;
        {
            let mut inner = runtime.inner.lock().unwrap();
            for job in [completed, cancelled, failed, paused, private] {
                inner.store.save(&job).unwrap();
                inner.jobs.insert(job.id.clone(), job);
            }
        }

        let cleanup = req(
            "clear-history-metadata",
            Command::Library {
                operation: LibraryCommand::ClearHistoryMetadata,
            },
        );
        assert!(matches!(
            runtime.handle_with_role(cleanup.clone(), true),
            Err(DownloadError::NotFound)
        ));
        assert!(matches!(
            runtime.handle(cleanup),
            Ok(Payload::HistoryMetadataCleared { records: 3 })
        ));
        assert!(completed_file.exists());
        assert_eq!(
            std::fs::read(&completed_file).unwrap(),
            b"keep the downloaded file"
        );
        assert!(matches!(
            runtime.handle(req("history-after-cleanup", Command::ListDownloads { offset: 0 })),
            Ok(Payload::Downloads { jobs, .. })
                if jobs.iter().map(|job| job.id.as_str()).collect::<std::collections::BTreeSet<_>>()
                    == ["failed-history", "paused-history"].into_iter().collect()
        ));
        let stored = runtime.inner.lock().unwrap().store.load().unwrap().jobs;
        assert_eq!(
            stored
                .iter()
                .map(|job| job.id.as_str())
                .collect::<std::collections::BTreeSet<_>>(),
            ["failed-history", "paused-history"].into_iter().collect()
        );
        runtime.shutdown().await;
    }

    #[test]
    fn resource_limits_reject_invalid_values_and_keep_valid_values_across_reopen() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let invalid = ResourceLimits {
            max_downloads: 0,
            ..Default::default()
        };
        assert!(matches!(
            runtime.handle(req(
                "invalid-limits",
                Command::SetResourceLimits { limits: invalid }
            )),
            Err(DownloadError::InvalidInput)
        ));
        let limits = ResourceLimits {
            max_downloads: 8,
            global_requests: 32,
            origin_requests: 32,
            bytes_per_second: Some(1),
        };
        assert!(matches!(
            runtime.handle(req(
                "valid-limits",
                Command::SetResourceLimits {
                    limits: limits.clone()
                }
            )),
            Ok(Payload::ResourceLimits { limits: saved }) if saved == limits
        ));
        drop(runtime);

        let reopened = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        assert!(matches!(
            reopened.handle(req("get-limits", Command::GetResourceLimits)),
            Ok(Payload::ResourceLimits { limits: saved }) if saved == limits
        ));
    }

    #[test]
    fn terminal_downloads_reject_resume_without_changing_durable_state() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        for (id, terminal_state) in [
            ("completed-job", TransferState::Completed),
            ("cancelled-job", TransferState::Cancelled),
        ] {
            let draft = create_draft(directory.path(), false, StartPolicy::Later);
            let mut job = download::create_job(id, draft.input.clone()).unwrap();
            job.creation = Some(draft);
            job.state = terminal_state.clone();
            job.durable = 17;
            runtime.inner.lock().unwrap().store.save(&job).unwrap();
            runtime.inner.lock().unwrap().jobs.insert(id.into(), job);

            assert!(matches!(
                runtime.handle(req(
                    &format!("resume-{id}"),
                    Command::ResumeDownload { job_id: id.into() }
                )),
                Err(DownloadError::InvalidState)
            ));
            let saved = runtime
                .handle(req(
                    &format!("get-{id}"),
                    Command::GetDownload { job_id: id.into() },
                ))
                .unwrap();
            assert!(
                matches!(saved, Payload::Download { job } if job.state == terminal_state && job.durable_bytes == "17")
            );
        }
    }

    #[test]
    fn invalid_categories_and_reused_request_ids_do_not_change_saved_organization() {
        let directory = TestDirectory::new();
        let runtime = Downloads::open_at(directory.path().to_path_buf()).unwrap();
        let invalid = OrganizationCommand::SaveCategories {
            categories: vec!["Custom only".into()],
        };
        assert!(matches!(
            runtime.handle(req(
                "bad-categories",
                Command::Organization { operation: invalid }
            )),
            Err(DownloadError::InvalidInput)
        ));

        let mut categories = default_categories();
        categories.push("Proyectos".into());
        let operation = OrganizationCommand::SaveCategories {
            categories: categories.clone(),
        };
        let request = req("category-receipt", Command::Organization { operation });
        assert!(matches!(
            runtime.handle(request.clone()),
            Ok(Payload::Organization { state }) if state.categories == categories
        ));
        assert!(matches!(
            runtime.handle(request.clone()),
            Ok(Payload::Organization { state }) if state.categories == categories
        ));

        let collision = req(
            "category-receipt",
            Command::Organization {
                operation: OrganizationCommand::SaveCategories {
                    categories: default_categories(),
                },
            },
        );
        assert!(matches!(
            runtime.handle(collision),
            Err(DownloadError::Conflict)
        ));
        assert!(matches!(
            runtime.handle(req("get-organization", Command::Organization { operation: OrganizationCommand::Get })),
            Ok(Payload::Organization { state }) if state.categories == categories
        ));
    }
}
