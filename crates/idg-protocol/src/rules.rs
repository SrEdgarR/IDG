use crate::{DownloadError, Priority};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct RuleEffect {
    pub directory: Option<String>,
    pub category: Option<String>,
    pub queue_id: Option<String>,
    pub bytes_per_second: Option<u32>,
    pub priority: Option<Priority>,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct OrganizationRule {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub rank: u32,
    pub domain: String,
    pub extension: String,
    pub media_type: String,
    pub min_bytes: Option<u32>,
    pub max_bytes: Option<u32>,
    /// UTC minutes of day; wrap across midnight is supported. Both bounds or neither.
    pub from_minute: Option<u32>,
    pub until_minute: Option<u32>,
    pub effect: RuleEffect,
}
impl OrganizationRule {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if self.id.is_empty()
            || self.id.len() > 64
            || self.name.trim().is_empty()
            || self.name.len() > 120
            || self.domain.len() > 253
            || self
                .domain
                .chars()
                .any(|c| c.is_control() || matches!(c, '/' | '?' | '#' | '@' | ':' | ' '))
            || self.extension.len() > 24
            || !self.extension.bytes().all(|b| b.is_ascii_alphanumeric())
            || self.media_type.len() > 120
            || self.media_type.chars().any(|c| c.is_control())
            || self
                .min_bytes
                .zip(self.max_bytes)
                .is_some_and(|(a, b)| a > b)
            || self.from_minute.is_some() != self.until_minute.is_some()
            || self
                .from_minute
                .zip(self.until_minute)
                .is_some_and(|(a, b)| a >= 1440 || b >= 1440 || a == b)
            || self.effect.bytes_per_second == Some(0)
            || self
                .effect
                .directory
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 4096)
            || self.effect.category.as_ref().is_some_and(|s| {
                s.trim().is_empty() || s.len() > 120 || s.chars().any(char::is_control)
            })
            || self
                .effect
                .queue_id
                .as_ref()
                .is_some_and(|s| s.is_empty() || s.len() > 64)
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
pub struct RulePreview {
    pub matched: Vec<String>,
    pub explanations: Vec<String>,
    pub effect: RuleEffect,
}
