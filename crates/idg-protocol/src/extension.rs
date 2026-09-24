use crate::DownloadSnapshot;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Only public, recent work is exposed to a browser profile. URLs and paths
/// never cross this interface, and private jobs are omitted by the runtime.
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
pub struct ExtensionState {
    pub autopick_mode: String,
    pub active_count: u32,
    pub jobs: Vec<DownloadSnapshot>,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct CaptureProposal {
    pub id: String,
    pub url: String,
    pub name: String,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CaptureDecision {
    Pending,
    Accepted,
    Rejected,
}
