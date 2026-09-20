use crate::DownloadError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum RequestMode {
    #[default]
    Automatic,
    Manual {
        requests: u32,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(rename_all = "snake_case")]
pub enum Priority {
    High,
    #[default]
    Normal,
    Low,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct TransferOptions {
    pub mode: RequestMode,
    /// Explicit caller assertion that this GET may safely be repeated in parallel.
    pub replay_safe: bool,
    pub bytes_per_second: Option<u32>,
    pub priority: Priority,
}
impl TransferOptions {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if matches!(self.mode,RequestMode::Manual{requests} if !(1..=32).contains(&requests))
            || self.bytes_per_second == Some(0)
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct ResourceLimits {
    pub max_downloads: u32,
    pub global_requests: u32,
    pub origin_requests: u32,
    pub bytes_per_second: Option<u32>,
}
impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_downloads: 3,
            global_requests: 16,
            origin_requests: 8,
            bytes_per_second: None,
        }
    }
}
impl ResourceLimits {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if !(1..=8).contains(&self.max_downloads)
            || !(1..=32).contains(&self.global_requests)
            || !(1..=32).contains(&self.origin_requests)
            || self.bytes_per_second == Some(0)
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RangeSnapshot {
    pub start: String,
    pub end_exclusive: String,
    pub durable: bool,
}
