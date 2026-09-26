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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transfer_options_accept_limits_and_reject_zero_or_out_of_range_values() {
        for requests in [1, 32] {
            assert_eq!(
                TransferOptions {
                    mode: RequestMode::Manual { requests },
                    ..Default::default()
                }
                .validate(),
                Ok(())
            );
        }
        for requests in [0, 33] {
            assert_eq!(
                TransferOptions {
                    mode: RequestMode::Manual { requests },
                    ..Default::default()
                }
                .validate(),
                Err(DownloadError::InvalidInput)
            );
        }
        for bytes_per_second in [None, Some(1), Some(u32::MAX)] {
            assert_eq!(
                TransferOptions {
                    bytes_per_second,
                    ..Default::default()
                }
                .validate(),
                Ok(())
            );
        }
        assert_eq!(
            TransferOptions {
                bytes_per_second: Some(0),
                ..Default::default()
            }
            .validate(),
            Err(DownloadError::InvalidInput)
        );
    }

    #[test]
    fn resource_budgets_enforce_independent_bounds_and_allow_unlimited_rate() {
        for limits in [
            ResourceLimits {
                max_downloads: 1,
                global_requests: 1,
                origin_requests: 1,
                bytes_per_second: None,
            },
            ResourceLimits {
                max_downloads: 8,
                global_requests: 32,
                origin_requests: 32,
                bytes_per_second: Some(1),
            },
            ResourceLimits {
                bytes_per_second: Some(u32::MAX),
                ..Default::default()
            },
        ] {
            assert_eq!(limits.validate(), Ok(()));
        }

        for limits in [
            ResourceLimits {
                max_downloads: 0,
                ..Default::default()
            },
            ResourceLimits {
                max_downloads: 9,
                ..Default::default()
            },
            ResourceLimits {
                global_requests: 0,
                ..Default::default()
            },
            ResourceLimits {
                global_requests: 33,
                ..Default::default()
            },
            ResourceLimits {
                origin_requests: 0,
                ..Default::default()
            },
            ResourceLimits {
                origin_requests: 33,
                ..Default::default()
            },
            ResourceLimits {
                bytes_per_second: Some(0),
                ..Default::default()
            },
        ] {
            assert_eq!(limits.validate(), Err(DownloadError::InvalidInput));
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct RangeSnapshot {
    pub start: String,
    pub end_exclusive: String,
    pub durable: bool,
}
