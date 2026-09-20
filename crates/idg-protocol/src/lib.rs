//! Versioned local protocol for authenticated runtime clients.
pub const VERSION: u32 = 1;
pub const MAX_FRAME: usize = 256 * 1024;
mod download;
pub use download::*;
mod resources;
pub use resources::*;

use serde::{Deserialize, Serialize};
use std::{io, time::Duration};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use ts_rs::TS;

pub const IO_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Command {
    Handshake,
    Ping,
    GetSnapshot,
    Subscribe,
    Shutdown,
    GetDownloadCapabilities,
    AddDownload {
        input: NewDownload,
    },
    AddDownloadWithOptions {
        input: NewDownload,
        options: TransferOptions,
    },
    SetDownloadOptions {
        job_id: String,
        options: TransferOptions,
    },
    SetResourceLimits {
        limits: ResourceLimits,
    },
    GetResourceLimits,
    GetDownloadRanges {
        job_id: String,
        offset: u32,
    },
    GetDownload {
        job_id: String,
    },
    ListDownloads {
        offset: u32,
    },
    PauseDownload {
        job_id: String,
    },
    ResumeDownload {
        job_id: String,
    },
    CancelDownload {
        job_id: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(deny_unknown_fields)]
pub struct Request {
    pub version: u32,
    pub id: String,
    pub command: Command,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    InvalidMessage,
    IncompatibleVersion,
    HandshakeRequired,
    Unauthorized,
    Unavailable,
    Timeout,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Snapshot {
    pub runtime_id: String,
    pub process_id: u32,
    pub sequence: u32,
    pub clients: u32,
    pub stopping: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ConnectionState {
    pub connected: bool,
    pub snapshot: Option<Snapshot>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Payload {
    ResourceLimits {
        limits: ResourceLimits,
    },
    DownloadRanges {
        ranges: Vec<RangeSnapshot>,
        next_offset: Option<u32>,
    },
    DownloadCapabilities {
        operations: Vec<String>,
        schema_version: u32,
        max_active: u32,
        max_write_bytes: u32,
        strong_validator_required: bool,
    },
    DownloadChanged {
        sequence: u32,
        job: DownloadSnapshot,
    },
    Hello {
        capabilities: Vec<Command>,
        snapshot: Snapshot,
    },
    Pong,
    Snapshot {
        snapshot: Snapshot,
    },
    Subscribed {
        snapshot: Snapshot,
    },
    Stopping,
    Error {
        code: ErrorCode,
    },
    Download {
        job: DownloadSnapshot,
    },
    Downloads {
        unavailable: Vec<UnavailableDownload>,
        jobs: Vec<DownloadSnapshot>,
        next_offset: Option<u32>,
    },
    DownloadFailure {
        code: DownloadError,
        message: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct Response {
    pub version: u32,
    pub id: String,
    pub payload: Payload,
}

impl Response {
    pub fn new(id: &str, payload: Payload) -> Self {
        Self {
            version: VERSION,
            id: id.into(),
            payload,
        }
    }
    pub fn error(id: &str, code: ErrorCode) -> Self {
        Self::new(id, Payload::Error { code })
    }
}

pub fn decode_request(bytes: &[u8]) -> Result<Request, ErrorCode> {
    let request: Request = serde_json::from_slice(bytes).map_err(|_| ErrorCode::InvalidMessage)?;
    if request.id.is_empty()
        || request.id.len() > 64
        || !request
            .id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_".contains(&b))
    {
        return Err(ErrorCode::InvalidMessage);
    }
    Ok(request)
}

/// EOF between frames is normal; EOF inside a prefix/body is a protocol error.
/// Once a frame begins, a peer has five seconds to finish it.
pub async fn read_frame<R: AsyncRead + Unpin>(reader: &mut R) -> io::Result<Option<Vec<u8>>> {
    let mut prefix = [0u8; 4];
    if reader.read(&mut prefix[..1]).await? == 0 {
        return Ok(None);
    }
    tokio::time::timeout(IO_TIMEOUT, async {
        reader.read_exact(&mut prefix[1..]).await?;
        let length = u32::from_le_bytes(prefix) as usize;
        if length == 0 || length > MAX_FRAME {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "frame limit"));
        }
        let mut body = vec![0; length];
        reader.read_exact(&mut body).await?;
        Ok(Some(body))
    })
    .await
    .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?
}

pub async fn write_frame<W: AsyncWrite + Unpin>(writer: &mut W, bytes: &[u8]) -> io::Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_FRAME {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "frame limit"));
    }
    tokio::time::timeout(IO_TIMEOUT, async {
        writer
            .write_all(&(bytes.len() as u32).to_le_bytes())
            .await?;
        writer.write_all(bytes).await?;
        writer.flush().await
    })
    .await
    .map_err(|_| io::Error::from(io::ErrorKind::TimedOut))?
}

pub async fn send<W: AsyncWrite + Unpin, T: Serialize>(
    writer: &mut W,
    value: &T,
) -> io::Result<()> {
    let bytes = serde_json::to_vec(value).map_err(io::Error::other)?;
    write_frame(writer, &bytes).await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_json_unknown_fields_and_ids_are_rejected() {
        for bytes in [
            b"not json".as_slice(),
            br#"{"version":1,"id":"x","command":"ping","secret":"x"}"#,
            br#"{"version":1,"id":"","command":"ping"}"#,
        ] {
            assert!(matches!(
                decode_request(bytes),
                Err(ErrorCode::InvalidMessage)
            ));
        }
    }
}
