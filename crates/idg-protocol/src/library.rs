use serde::{Deserialize, Serialize};
use ts_rs::TS;
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct SearchQuery {
    pub text: String,
    pub view: String,
    pub site: String,
    pub after: String,
    pub size: String,
    pub status: String,
    pub offset: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum BulkAction {
    Pause,
    Resume,
    Cancel,
    Hide,
    Restore,
    MoveQueue { queue_id: String },
    SetCategory { category: String },
    SetPriority { priority: crate::Priority },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
pub struct BulkItem {
    pub id: String,
    pub outcome: String,
    pub message: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum LibraryCommand {
    ClipboardStatus,
    TakeClipboard {
        id: u32,
    },
    DismissClipboard {
        id: u32,
    },
    PreviewDelete {
        job_id: String,
    },
    DeleteFile {
        job_id: String,
        path: String,
        sha256: String,
    },
    Search {
        query: SearchQuery,
    },
    Bulk {
        ids: Vec<String>,
        operation: BulkAction,
    },
    Duplicates {
        input: crate::NewDownload,
        context: String,
    },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq, Default)]
#[serde(default, deny_unknown_fields)]
pub struct LibrarySettings {
    pub statistics_visible: bool,
    pub retention_days: Option<u32>,
    pub statistics: bool,
    pub clipboard: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
pub struct SiteStatistic {
    pub domain: String,
    pub completed: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(default)]
pub struct LocalStatistics {
    pub completed: u32,
    pub bytes: String,
    pub timed_bytes: String,
    pub cycle_seconds: String,
    pub sites: Vec<SiteStatistic>,
    pub other_sites_completed: u32,
}
impl Default for LocalStatistics {
    fn default() -> Self {
        Self {
            completed: 0,
            bytes: "0".into(),
            timed_bytes: "0".into(),
            cycle_seconds: "0".into(),
            sites: Vec::new(),
            other_sites_completed: 0,
        }
    }
}
