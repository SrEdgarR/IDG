use crate::{DownloadError, Priority};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub fn default_queue_id() -> String {
    "main".into()
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(default, deny_unknown_fields)]
pub struct JobOrganization {
    #[serde(default = "default_queue_id")]
    pub queue_id: String,
    pub order: u32,
    pub category: Option<String>,
    pub private: bool,
    pub hidden: bool,
    pub finished_at: Option<u32>,
    pub context: String,
}
impl Default for JobOrganization {
    fn default() -> Self {
        Self {
            queue_id: default_queue_id(),
            order: 0,
            category: None,
            private: false,
            hidden: false,
            finished_at: None,
            context: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum PowerAction {
    None,
    Shutdown,
    Suspend,
    Hibernate,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleState {
    Pending,
    Applied,
    Missed,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct QueueSchedule {
    /// One fixed UTC instant, selected using an explicit timezone offset in the UI.
    pub at: u32,
    pub state: ScheduleState,
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct DownloadQueue {
    pub id: String,
    pub name: String,
    pub running: bool,
    pub concurrency: u32,
    pub priority: Priority,
    pub schedule: Option<QueueSchedule>,
    pub on_finish: PowerAction,
    pub power_armed: bool,
}
impl Default for DownloadQueue {
    fn default() -> Self {
        Self {
            id: "main".into(),
            name: "Principal".into(),
            running: false,
            concurrency: 3,
            priority: Priority::Normal,
            schedule: None,
            on_finish: PowerAction::None,
            power_armed: false,
        }
    }
}
impl DownloadQueue {
    pub fn validate(&self) -> Result<(), DownloadError> {
        if self.id.is_empty()
            || self.id.len() > 64
            || !self
                .id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
            || self.name.trim().is_empty()
            || self.name.len() > 120
            || self.name.chars().any(char::is_control)
            || !(1..=32).contains(&self.concurrency)
        {
            return Err(DownloadError::InvalidInput);
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum OrganizationCommand {
    Get,
    SaveQueue { queue: DownloadQueue },
    DeleteQueue { id: String, reassign_to: String },
    MoveJobs { ids: Vec<String>, queue_id: String },
    Reorder { queue_id: String, ids: Vec<String> },
    RunQueue { id: String, running: bool },
    PauseQueue { id: String },
    CancelPower,
    ArmPower { id: String, power: PowerAction },
}
#[derive(Debug, Clone, Serialize, Deserialize, TS, PartialEq)]
pub struct OrganizationState {
    pub queues: Vec<DownloadQueue>,
    pub power_message: String,
    pub power_remaining: Option<u32>,
    pub power_simulated: bool,
}
impl Default for OrganizationState {
    fn default() -> Self {
        Self {
            queues: vec![DownloadQueue::default()],
            power_message: String::new(),
            power_remaining: None,
            power_simulated: false,
        }
    }
}
