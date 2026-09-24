//! Completion policy and monotonic countdown; no OS calls in the core.
use idg_protocol::{OrganizationState, PowerAction, TransferState};

pub fn candidate<'a>(
    state: &OrganizationState,
    jobs: impl Iterator<Item = (&'a str, &'a TransferState)>,
    other_tasks: bool,
) -> Option<PowerAction> {
    if other_tasks {
        return None;
    }
    let jobs: Vec<_> = jobs.collect();
    // Conservative: deferred, paused, errors, cancellation and publication still block.
    if jobs.is_empty() || jobs.iter().any(|(_, s)| **s != TransferState::Completed) {
        return None;
    }
    let mut actions = state.queues.iter().filter(|q| {
        q.power_armed && q.on_finish != PowerAction::None && jobs.iter().any(|(id, _)| *id == q.id)
    });
    let first = actions.next()?.on_finish.clone();
    if actions.any(|q| q.on_finish != first) {
        return None;
    }
    Some(first)
}

#[derive(Debug)]
pub struct Countdown {
    action: PowerAction,
    deadline: u64,
}
impl Countdown {
    pub fn new(action: PowerAction, monotonic_seconds: u64) -> Self {
        Self {
            action,
            deadline: monotonic_seconds.saturating_add(60),
        }
    }
    pub fn remaining(&self, monotonic_seconds: u64) -> u32 {
        self.deadline.saturating_sub(monotonic_seconds).min(60) as u32
    }
    pub fn finish(self, monotonic_seconds: u64, clear: bool) -> Option<PowerAction> {
        if clear && monotonic_seconds >= self.deadline {
            Some(self.action)
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn other_work_errors_and_unpublished_files_block_power() {
        let mut state = OrganizationState::default();
        state.queues[0].power_armed = true;
        state.queues[0].on_finish = PowerAction::Shutdown;
        let completed = TransferState::Completed;
        assert_eq!(
            candidate(&state, [("main", &completed)].into_iter(), false),
            Some(PowerAction::Shutdown)
        );
        for blocked in [
            TransferState::Deferred,
            TransferState::Queued,
            TransferState::Paused,
            TransferState::Failed,
            TransferState::Cancelled,
            TransferState::Verifying,
            TransferState::PublishPending,
            TransferState::Downloading,
        ] {
            assert_eq!(
                candidate(
                    &state,
                    [("main", &completed), ("other", &blocked)].into_iter(),
                    false
                ),
                None
            );
        }
        assert_eq!(
            candidate(&state, [("main", &completed)].into_iter(), true),
            None
        );
        assert_eq!(candidate(&state, std::iter::empty(), false), None);
    }
    #[test]
    fn countdown_cancel_and_consumption_do_not_execute_twice() {
        let c = Countdown::new(PowerAction::Suspend, 100);
        assert_eq!(c.remaining(159), 1);
        assert_eq!(c.finish(160, false), None);
        let c = Countdown::new(PowerAction::Hibernate, 100);
        assert_eq!(c.finish(160, true), Some(PowerAction::Hibernate));
        // Ownership consumes countdown; persisted disarmed queues do not rearm after restart.
        assert_eq!(
            candidate(
                &OrganizationState::default(),
                [("main", &TransferState::Completed)].into_iter(),
                false
            ),
            None
        );
    }
}
