mod files;
mod http;
mod media_task;
pub mod ranges;
pub mod resources;
mod segmented;
pub use files::{create_job, directory_for, recover, recoverable_matches, validate_input};
pub use http::{client, transfer, transfer_managed};
use idg_protocol::*;
pub use media_task::{MediaSegment, MediaTask};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
    #[serde(default)]
    pub organization: JobOrganization,
    #[serde(default)]
    pub creation: Option<CreateDownload>,
    #[serde(default)]
    pub media: Option<MediaTask>,
    #[serde(default)]
    pub options: TransferOptions,
    #[serde(default)]
    pub ranges: Vec<ranges::DurableRange>,
    #[serde(default)]
    pub transferred: u64,
    #[serde(default)]
    pub retries: u32,
    #[serde(skip)]
    pub active_requests: u32,
    #[serde(skip)]
    pub target_requests: u32,
    #[serde(default)]
    pub strategy: String,
    pub id: String,
    pub input: NewDownload,
    pub final_path: String,
    pub temporary: String,
    pub effective_url: Option<String>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
    pub total: Option<u64>,
    pub received: u64,
    pub durable: u64,
    pub prefix_sha256: String,
    pub calculated_sha256: Option<String>,
    pub verified: bool,
    pub state: TransferState,
    pub error: Option<DownloadError>,
    pub range_confirmed: bool,
    pub retry_after_seconds: Option<u32>,
    pub retry_not_before: Option<u64>,
    pub created_at: u64,
}
impl Job {
    pub fn snapshot(&self) -> DownloadSnapshot {
        DownloadSnapshot {
            queue_id: self.organization.queue_id.clone(),
            queue_order: self.organization.order,
            private: self.organization.private,
            category: self.organization.category.clone().unwrap_or_else(|| {
                self.creation
                    .as_ref()
                    .map(|c| c.category.clone())
                    .unwrap_or_else(|| "Otros".into())
            }),
            domain: reqwest::Url::parse(&self.input.url)
                .ok()
                .and_then(|u| u.host_str().map(str::to_owned))
                .unwrap_or_default(),
            created_at: self.created_at.to_string(),
            options: self.options.clone(),
            active_requests: self.active_requests,
            target_requests: self.target_requests,
            ranges_total: self.ranges.len() as u32,
            ranges_durable: self.ranges.iter().filter(|r| r.sha256.is_some()).count() as u32,
            transferred_bytes: self.transferred.to_string(),
            retries: self.retries,
            strategy: self.strategy.clone(),
            resume_capability: if self.range_confirmed {
                ResumeCapability::RangeVerified
            } else if self.etag.is_some() {
                ResumeCapability::ValidatorAvailable
            } else {
                ResumeCapability::Unknown
            },
            integrity: if self.error == Some(DownloadError::HashMismatch) {
                IntegrityState::Mismatch
            } else if self.verified {
                IntegrityState::Verified
            } else if self.calculated_sha256.is_some() {
                IntegrityState::Calculated
            } else {
                IntegrityState::NotChecked
            },
            id: self.id.clone(),
            name: std::path::Path::new(&self.final_path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            state: self.state.clone(),
            received_bytes: self.received.to_string(),
            durable_bytes: self.durable.to_string(),
            total_bytes: self.total.map(|n| n.to_string()),
            calculated_sha256: self.calculated_sha256.clone(),
            verified_against_reference: self.verified,
            media_stage: self.media.as_ref().map(|media| media.stage.clone()),
            resume: if self.range_confirmed {
                "Rango y representación confirmados en la última respuesta"
            } else if self.etag.is_some() {
                "Validador disponible; rango pendiente de comprobar"
            } else {
                "No hay validador fuerte; recuperación no comprobada"
            }
            .into(),
            error: self.error.clone(),
            message: self.error.as_ref().map(|e| e.message().into()),
            retry_after_seconds: self.retry_after_seconds,
        }
    }
}
pub trait Checkpoint {
    /// Called only after the corresponding file bytes have been synced.
    fn save(&mut self, job: &Job) -> Result<(), DownloadError>;
    fn progress(&mut self, job: &Job) {
        let _ = job;
    }
}

/// Publish a locally generated output only after its caller has verified its
/// media streams. The usual hash, checkpoint and conflict-safe publication
/// path remains the single authority for the final file.
pub async fn publish_generated(
    job: &mut Job,
    store: &mut dyn Checkpoint,
) -> Result<(), DownloadError> {
    if job.media.is_none() || job.state != TransferState::Verifying {
        return Err(DownloadError::InvalidState);
    }
    let path = std::path::Path::new(&job.temporary);
    files::ordinary(path)?;
    let metadata = std::fs::symlink_metadata(path).map_err(file_error)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() == 0 {
        return Err(DownloadError::Representation);
    }
    let mut file = tokio::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .await
        .map_err(file_error)?;
    let mut hash = sha2::Sha256::new();
    use sha2::Digest;
    use tokio::io::AsyncReadExt;
    let mut buffer = [0u8; 65536];
    let mut bytes = 0u64;
    loop {
        let count = file.read(&mut buffer).await.map_err(file_error)?;
        if count == 0 {
            break;
        }
        bytes = bytes
            .checked_add(count as u64)
            .ok_or(DownloadError::SizeMismatch)?;
        hash.update(&buffer[..count]);
    }
    file.sync_all().await.map_err(file_error)?;
    job.total = Some(bytes);
    job.received = bytes;
    job.durable = bytes;
    job.prefix_sha256 = format!("{:x}", hash.finalize());
    http::finish(job, store).await
}

#[cfg(test)]
mod media_tests {
    use super::*;

    struct Store;

    impl Checkpoint for Store {
        fn save(&mut self, _: &Job) -> Result<(), DownloadError> {
            Ok(())
        }
    }

    #[tokio::test]
    async fn generated_media_is_synced_and_published_on_windows() {
        let directory = tempfile::tempdir().unwrap();
        let input = NewDownload {
            url: "https://example.org/media.m3u8".into(),
            directory: directory.path().to_string_lossy().into_owned(),
            name: "media.mkv".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
        };
        let mut job = create_job("generated-media", input).unwrap();
        let bytes = b"verified generated media";
        std::fs::write(&job.temporary, bytes).unwrap();
        job.media = Some(MediaTask {
            kind: MediaManifestKind::Hls,
            fingerprint: "a".repeat(64),
            selection: MediaSelection {
                variant_index: Some(0),
                audio_track_index: None,
                output: MediaOutput::Matroska,
            },
            main_is_video: true,
            main_has_audio: false,
            main_segments: Vec::new(),
            audio_segments: Vec::new(),
            duration_ms: Some(1_000),
            stage: MediaStage::Verifying,
        });
        job.state = TransferState::Verifying;

        publish_generated(&mut job, &mut Store).await.unwrap();

        assert_eq!(job.state, TransferState::Completed);
        assert_eq!(std::fs::read(&job.final_path).unwrap(), bytes);
        assert!(!std::path::Path::new(&job.temporary).exists());
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Control {
    Run,
    Pause,
    Cancel,
}

pub fn file_error(e: std::io::Error) -> DownloadError {
    let full = if cfg!(windows) {
        matches!(e.raw_os_error(), Some(39 | 112))
    } else {
        e.raw_os_error() == Some(28)
    };
    if full {
        DownloadError::DiskFull
    } else {
        DownloadError::FileIo
    }
}
