use crate::DownloadError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Serialize, Deserialize, TS, PartialEq, Eq, Default)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
#[ts(tag = "mode")]
pub enum ProxyPolicy {
    #[default]
    Direct,
    Environment,
    Explicit {
        url: String,
    },
}
impl std::fmt::Debug for ProxyPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Direct => f.write_str("Direct"),
            Self::Environment => f.write_str("Environment"),
            Self::Explicit { .. } => f.write_str("Explicit { endpoint: redacted }"),
        }
    }
}
impl ProxyPolicy {
    pub fn validate(&self) -> Result<(), DownloadError> {
        match self {
            Self::Explicit { url } if !valid_proxy_endpoint(url) => {
                Err(DownloadError::InvalidInput)
            }
            _ => Ok(()),
        }
    }
}

fn valid_proxy_endpoint(url: &str) -> bool {
    if url.len() > 2048 {
        return false;
    }
    let Some((scheme, authority)) = url.split_once("://") else {
        return false;
    };
    if !["http", "https", "socks5", "socks5h"].contains(&scheme)
        || authority.is_empty()
        || authority
            .bytes()
            .any(|b| b <= 0x20 || b == 0x7f || b"@/?#\\".contains(&b))
    {
        return false;
    }
    let (host, port) = if let Some(rest) = authority.strip_prefix('[') {
        let Some((host, rest)) = rest.split_once(']') else {
            return false;
        };
        if host.parse::<std::net::Ipv6Addr>().is_err() {
            return false;
        }
        let Some(port) = rest.strip_prefix(':') else {
            return false;
        };
        (host, port)
    } else {
        let Some((host, port)) = authority.rsplit_once(':') else {
            return false;
        };
        if host.contains(':') || !valid_proxy_host(host) {
            return false;
        }
        (host, port)
    };
    !host.is_empty() && port.parse::<u16>().is_ok_and(|port| port != 0)
}

fn valid_proxy_host(host: &str) -> bool {
    if host.parse::<std::net::IpAddr>().is_ok() {
        return true;
    }
    host.len() <= 253
        && host.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label.as_bytes()[0].is_ascii_alphanumeric()
                && label.as_bytes()[label.len() - 1].is_ascii_alphanumeric()
                && label
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-')
        })
}

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
    /// `None` inherits the global policy while composing a download.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy: Option<ProxyPolicy>,
}
impl TransferOptions {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if matches!(self.mode,RequestMode::Manual{requests} if !(1..=32).contains(&requests))
            || self.bytes_per_second == Some(0)
        {
            return Err(DownloadError::InvalidInput);
        }
        if let Some(proxy) = &self.proxy {
            proxy.validate()?;
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
    fn proxy_policy_accepts_only_credential_free_http_and_socks_endpoints() {
        for url in [
            "http://proxy.example:8080",
            "https://127.0.0.1:8443",
            "socks5://[::1]:1080",
            "socks5h://localhost:1080",
        ] {
            assert_eq!(
                ProxyPolicy::Explicit { url: url.into() }.validate(),
                Ok(()),
                "{url}"
            );
        }
        for url in [
            "http://user:secret@proxy.example:8080",
            "file://proxy.example:8080",
            "http://proxy.example",
            "http://proxy.example:0",
            "http://proxy.example:8080/path",
            "http://proxy.example:8080?secret=x",
            "http://proxy.example:8080#fragment",
            "http://[not-ip]:8080",
        ] {
            assert_eq!(
                ProxyPolicy::Explicit { url: url.into() }.validate(),
                Err(DownloadError::InvalidInput),
                "{url}"
            );
        }
        let debug = format!(
            "{:?}",
            ProxyPolicy::Explicit {
                url: "http://proxy.example:8080".into()
            }
        );
        assert!(!debug.contains("proxy.example"));
    }

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
