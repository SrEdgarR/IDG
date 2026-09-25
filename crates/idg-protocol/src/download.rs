use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct UnavailableDownload {
    pub id: String,
    pub error: DownloadError,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum ResumeCapability {
    Unknown,
    ValidatorAvailable,
    RangeVerified,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum IntegrityState {
    NotChecked,
    Calculated,
    Verified,
    Mismatch,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictPolicy {
    Rename,
    Reject,
    Replace,
}

// Never log this input: URLs may contain signed query strings.
#[derive(Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct NewDownload {
    pub url: String,
    pub directory: String,
    pub name: String,
    pub expected_sha256: Option<String>,
    pub conflict: ConflictPolicy,
}
impl std::fmt::Debug for NewDownload {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("NewDownload { redacted }")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn debug_output_never_exposes_signed_url_or_credentials() {
        let input = NewDownload {
            url: "https://user:password@example.org/file?token=fixture-secret".into(),
            directory: "C:\\Downloads".into(),
            name: "file.bin".into(),
            expected_sha256: None,
            conflict: ConflictPolicy::Reject,
        };
        let output = format!("{input:?}");
        assert_eq!(output, "NewDownload { redacted }");
        assert!(!output.contains("fixture-secret"));
        assert!(!output.contains("password"));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TransferState {
    Deferred,
    Queued,
    Probing,
    Downloading,
    Paused,
    Verifying,
    PublishPending,
    Completed,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DownloadError {
    InvalidInput,
    Busy,
    NotFound,
    InvalidState,
    Conflict,
    Storage,
    Network,
    Timeout,
    Tls,
    AccessDenied,
    RetryLater,
    HttpStatus,
    UnsafeResume,
    ResourceChanged,
    RangeIgnored,
    InvalidRange,
    Expired,
    Representation,
    SizeMismatch,
    HashMismatch,
    PartialChanged,
    DiskFull,
    FileIo,
    PublishBlocked,
    SecretUnavailable,
}
impl DownloadError {
    pub fn message(&self) -> &'static str {
        match self {
            Self::InvalidInput => "Nombre, ruta, URL o hash no válidos.",
            Self::Busy => "Hay una transferencia activa; pausa o espera antes de iniciar otra.",
            Self::NotFound => "Trabajo no encontrado.",
            Self::InvalidState => "La acción no es válida para el estado actual.",
            Self::Conflict => "El destino ya existe; elige renombrar o reemplazar explícitamente.",
            Self::Storage => {
                "No se pudo guardar un checkpoint. El trabajo no se considera completado."
            }
            Self::Network => {
                "No se pudo establecer o mantener la conexión validada. Se conservan los bytes confirmados."
            }
            Self::Timeout => "El servidor no respondió dentro del plazo.",
            Self::Tls => "No se pudo establecer una conexión TLS validada.",
            Self::AccessDenied => "El servidor requiere autorización o denegó el acceso.",
            Self::RetryLater => "El servidor pide esperar; no se reintenta automáticamente.",
            Self::HttpStatus => "El servidor devolvió una respuesta HTTP no admitida.",
            Self::UnsafeResume => {
                "No hay evidencia suficiente para reanudar; se conserva el parcial."
            }
            Self::ResourceChanged => "El recurso cambió. No se han mezclado representaciones.",
            Self::RangeIgnored => "El servidor ignoró el rango; no se añadieron bytes al parcial.",
            Self::InvalidRange => "La respuesta parcial no corresponde a los bytes pendientes.",
            Self::Expired => "El recurso no está disponible o el enlace venció.",
            Self::Representation => {
                "Representación transformada o página HTML no autorizada como archivo."
            }
            Self::SizeMismatch => "El tamaño recibido no coincide con el esperado.",
            Self::HashMismatch => {
                "SHA-256 no coincide con la referencia; no se publica el archivo."
            }
            Self::PartialChanged => {
                "El parcial no coincide con su checkpoint; se conserva para diagnóstico."
            }
            Self::DiskFull => "No hay espacio disponible; se conserva el último checkpoint.",
            Self::FileIo => "No se pudo acceder al archivo temporal o al destino.",
            Self::PublishBlocked => {
                "El archivo está verificado, pero no se pudo publicar. Comprueba permisos o bloqueos y reintenta."
            }
            Self::SecretUnavailable => {
                "No se pudo recuperar el recurso protegido para este usuario."
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct DownloadSnapshot {
    pub queue_id: String,
    pub queue_order: u32,
    pub private: bool,
    pub category: String,
    pub domain: String,
    pub created_at: String,
    pub options: crate::TransferOptions,
    pub active_requests: u32,
    pub target_requests: u32,
    pub ranges_total: u32,
    pub ranges_durable: u32,
    pub transferred_bytes: String,
    pub retries: u32,
    pub strategy: String,
    pub resume_capability: ResumeCapability,
    pub integrity: IntegrityState,
    pub id: String,
    pub name: String,
    pub state: TransferState,
    // Decimal strings preserve all 64-bit byte counts in JS.
    pub received_bytes: String,
    pub durable_bytes: String,
    pub total_bytes: Option<String>,
    pub resume: String,
    pub calculated_sha256: Option<String>,
    pub verified_against_reference: bool,
    pub error: Option<DownloadError>,
    pub message: Option<String>,
    pub retry_after_seconds: Option<u32>,
}
