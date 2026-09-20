//! Pure scheduling policy: callers supply UTC time, never change the system clock.
use idg_protocol::{DownloadQueue, ScheduleState};

/// A one-shot schedule catches up only within fifteen minutes. Persist before starting work.
pub fn apply_schedule(queue: &mut DownloadQueue, now: u64) -> bool {
    let Some(schedule) = queue.schedule.as_mut() else {
        return false;
    };
    if schedule.state != ScheduleState::Pending || now < u64::from(schedule.at) {
        return false;
    }
    if now.saturating_sub(u64::from(schedule.at)) <= 900 {
        schedule.state = ScheduleState::Applied;
        queue.running = true;
    } else {
        schedule.state = ScheduleState::Missed;
        queue.running = false;
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use idg_protocol::QueueSchedule;
    #[test]
    fn schedule_is_once_even_after_rewind_restart_or_dst_overlap() {
        let mut q = DownloadQueue {
            schedule: Some(QueueSchedule {
                at: 1_000,
                state: ScheduleState::Pending,
            }),
            ..Default::default()
        };
        assert!(!apply_schedule(&mut q, 999));
        assert!(apply_schedule(&mut q, 1_001));
        q.running = false;
        let mut reopened: DownloadQueue =
            serde_json::from_str(&serde_json::to_string(&q).unwrap()).unwrap();
        for now in [999, 1_000, 4_600, 1_001] {
            assert!(!apply_schedule(&mut reopened, now));
            assert!(!reopened.running);
        }
    }
    #[test]
    fn overdue_is_explicit_and_unknown_time_does_not_launch() {
        let mut q = DownloadQueue {
            schedule: Some(QueueSchedule {
                at: 1_000,
                state: ScheduleState::Pending,
            }),
            ..Default::default()
        };
        assert!(apply_schedule(&mut q, 1_901));
        assert_eq!(q.schedule.unwrap().state, ScheduleState::Missed);
        assert!(!q.running);
    }
}
