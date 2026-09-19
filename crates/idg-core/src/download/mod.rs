mod files;
mod http;
pub use files::{create_job, recover, validate_input};
pub use http::{client, transfer};
use idg_protocol::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub struct Job {
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
