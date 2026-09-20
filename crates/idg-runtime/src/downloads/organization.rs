use super::*;
impl Downloads {
    pub(super) fn organize(
        &self,
        inner: &mut Inner,
        operation: OrganizationCommand,
        request: &Request,
    ) -> Result<Payload, DownloadError> {
        if !matches!(operation, OrganizationCommand::Get)
            && let Some(payload) = inner.store.receipt(request)?
        {
            return Ok(payload);
        }
        let mut state = inner.organization.clone();
        let mut changed = Vec::<Job>::new();
        let mut pause = None;
        match operation {
            OrganizationCommand::SetLibrarySettings { settings } => {
                if settings
                    .retention_days
                    .is_some_and(|n| !(1..=36500).contains(&n))
                {
                    return Err(DownloadError::InvalidInput);
                }
                if settings.statistics && !state.library.statistics {
                    for job in inner.jobs.values().filter(|j| {
                        j.state == TransferState::Completed
                            && !inner.active.contains_key(&j.id)
                            && !j.organization.stats_recorded
                    }) {
                        let mut job = job.clone();
                        job.organization.stats_recorded = true;
                        changed.push(job);
                    }
                }
                state.library = settings;
            }
            OrganizationCommand::ClearStatistics => {
                state.statistics = LocalStatistics::default();
                for job in inner.jobs.values().filter(|j| {
                    j.state == TransferState::Completed
                        && !inner.active.contains_key(&j.id)
                        && !j.organization.stats_recorded
                }) {
                    let mut job = job.clone();
                    job.organization.stats_recorded = true;
                    changed.push(job);
                }
            }
            OrganizationCommand::EditJob {
                job_id,
                hidden,
                category,
                priority,
            } => {
                if inner.active.contains_key(&job_id) {
                    return Err(DownloadError::Busy);
                }
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if let Some(hidden) = hidden {
                    if !matches!(
                        job.state,
                        TransferState::Completed | TransferState::Cancelled
                    ) {
                        return Err(DownloadError::InvalidState);
                    }
                    job.organization.hidden = hidden;
                    if !hidden {
                        job.organization.history_visible_since = Some(
                            std::time::SystemTime::now()
                                .duration_since(std::time::UNIX_EPOCH)
                                .unwrap_or_default()
                                .as_secs()
                                .min(u32::MAX as u64) as u32,
                        );
                    }
                }
                if let Some(category) = category {
                    if !state.categories.contains(&category) {
                        return Err(DownloadError::InvalidInput);
                    }
                    job.organization.category = Some(category);
                }
                if let Some(priority) = priority {
                    job.options.priority = priority;
                }
                changed.push(job);
            }
            OrganizationCommand::Get => return Ok(Payload::Organization { state }),
            OrganizationCommand::PreviewRules { input, overrides } => {
                return Ok(Payload::RulePreview {
                    preview: super::rules::preview(&state, &input, None, None, &overrides)?,
                });
            }
            OrganizationCommand::PreviewJobRules { job_id } => {
                return Ok(Payload::RulePreview {
                    preview: super::rules::job_preview(
                        &state,
                        inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?,
                    )?,
                });
            }
            OrganizationCommand::SaveRule { rule } => {
                rule.validate()?;
                super::rules::effect_valid(&state, &rule.effect)?;
                if let Some(old) = state.rules.iter_mut().find(|r| r.id == rule.id) {
                    *old = rule;
                } else {
                    if state.rules.len() >= 64 {
                        return Err(DownloadError::Busy);
                    }
                    state.rules.push(rule);
                }
            }
            OrganizationCommand::DeleteRule { id } => {
                state.rules.retain(|r| r.id != id);
            }
            OrganizationCommand::SaveCategories { categories } => {
                if categories.len() > 64
                    || categories
                        .iter()
                        .collect::<std::collections::BTreeSet<_>>()
                        .len()
                        != categories.len()
                    || categories.iter().any(|s| {
                        s.trim().is_empty() || s.len() > 120 || s.chars().any(char::is_control)
                    })
                    || default_categories().iter().any(|s| !categories.contains(s))
                    || inner
                        .jobs
                        .values()
                        .any(|j| !categories.contains(&j.snapshot().category))
                    || state.rules.iter().any(|r| {
                        r.effect
                            .category
                            .as_ref()
                            .is_some_and(|s| !categories.contains(s))
                    })
                {
                    return Err(DownloadError::InvalidInput);
                }
                state.categories = categories;
            }
            OrganizationCommand::ApplyJobRules { job_id, preview } => {
                if inner.active.contains_key(&job_id) {
                    return Err(DownloadError::Busy);
                }
                let mut job = inner
                    .jobs
                    .get(&job_id)
                    .ok_or(DownloadError::NotFound)?
                    .clone();
                if super::rules::job_preview(&state, &job)? != preview {
                    return Err(DownloadError::Conflict);
                }
                super::rules::effect_valid(&state, &preview.effect)?;
                if let Some(v) = preview.effect.category {
                    job.organization.category = Some(v);
                }
                if let Some(v) = preview.effect.queue_id {
                    job.organization.queue_id = v;
                }
                if let Some(v) = preview.effect.bytes_per_second {
                    job.options.bytes_per_second = Some(v);
                }
                if let Some(v) = preview.effect.priority {
                    job.options.priority = v;
                }
                job.options.validate()?;
                changed.push(job);
            }
            OrganizationCommand::SaveQueue { mut queue } => {
                queue.validate()?;
                let previous = state.queues.iter().find(|q| q.id == queue.id);
                queue.power_armed =
                    previous.is_some_and(|q| q.power_armed && q.on_finish == queue.on_finish);
                let same_instant = previous.is_some_and(|old| {
                    old.schedule.as_ref().map(|s| s.at) == queue.schedule.as_ref().map(|s| s.at)
                });
                if !same_instant && let Some(schedule) = &mut queue.schedule {
                    schedule.state = ScheduleState::Pending;
                    queue.running = false;
                }
                if let Some(old) = state.queues.iter_mut().find(|q| q.id == queue.id) {
                    if let (Some(a), Some(b)) = (&queue.schedule, &old.schedule)
                        && a.at == b.at
                    {
                        queue.schedule = old.schedule.clone();
                    }
                    *old = queue;
                } else {
                    if state.queues.len() >= 32 {
                        return Err(DownloadError::Busy);
                    }
                    state.queues.push(queue);
                }
            }
            OrganizationCommand::DeleteQueue { id, reassign_to } => {
                if id == "main"
                    || id == reassign_to
                    || !state.queues.iter().any(|q| q.id == reassign_to)
                {
                    return Err(DownloadError::InvalidInput);
                }
                for job in inner
                    .jobs
                    .values()
                    .filter(|j| j.organization.queue_id == id)
                {
                    if inner.active.contains_key(&job.id) {
                        return Err(DownloadError::Busy);
                    }
                    let mut j = job.clone();
                    j.organization.queue_id = reassign_to.clone();
                    changed.push(j);
                }
                state.queues.retain(|q| q.id != id);
            }
            OrganizationCommand::MoveJobs { ids, queue_id } => {
                if ids.len() > 1000
                    || ids.iter().collect::<std::collections::BTreeSet<_>>().len() != ids.len()
                    || !state.queues.iter().any(|q| q.id == queue_id)
                {
                    return Err(DownloadError::InvalidInput);
                }
                let last = inner
                    .jobs
                    .values()
                    .filter(|j| j.organization.queue_id == queue_id)
                    .map(|j| j.organization.order)
                    .max()
                    .unwrap_or(0);
                for (i, id) in ids.iter().enumerate() {
                    if inner.active.contains_key(id) {
                        return Err(DownloadError::Busy);
                    }
                    let mut job = inner.jobs.get(id).ok_or(DownloadError::NotFound)?.clone();
                    job.organization.queue_id = queue_id.clone();
                    job.organization.order = last.saturating_add(i as u32 + 1);
                    changed.push(job);
                }
            }
            OrganizationCommand::MoveUp { job_id } => {
                let job = inner.jobs.get(&job_id).ok_or(DownloadError::NotFound)?;
                let mut ordered: Vec<_> = inner
                    .jobs
                    .values()
                    .filter(|j| j.organization.queue_id == job.organization.queue_id)
                    .collect();
                ordered.sort_by_key(|j| (j.organization.order, j.created_at, j.id.clone()));
                let index = ordered
                    .iter()
                    .position(|j| j.id == job_id)
                    .ok_or(DownloadError::NotFound)?;
                if index > 0 {
                    ordered.swap(index - 1, index);
                }
                for (i, job) in ordered.into_iter().enumerate() {
                    if inner.active.contains_key(&job.id) {
                        return Err(DownloadError::Busy);
                    }
                    let mut job = job.clone();
                    job.organization.order = i as u32;
                    changed.push(job);
                }
            }
            OrganizationCommand::Reorder { queue_id, ids } => {
                let unique: std::collections::BTreeSet<_> = ids.iter().collect();
                if ids.len() > 1000 || unique.len() != ids.len() {
                    return Err(DownloadError::InvalidInput);
                }
                let mut remaining: Vec<_> = inner
                    .jobs
                    .values()
                    .filter(|j| j.organization.queue_id == queue_id && !unique.contains(&j.id))
                    .collect();
                remaining.sort_by_key(|j| (j.organization.order, j.created_at, j.id.clone()));
                for (i, id) in ids
                    .iter()
                    .chain(remaining.iter().map(|j| &j.id))
                    .enumerate()
                {
                    let mut j = inner.jobs.get(id).ok_or(DownloadError::NotFound)?.clone();
                    if j.organization.queue_id != queue_id || inner.active.contains_key(id) {
                        return Err(DownloadError::Busy);
                    }
                    j.organization.order = i as u32;
                    changed.push(j);
                }
            }
            OrganizationCommand::RunQueue { id, running } => {
                state
                    .queues
                    .iter_mut()
                    .find(|q| q.id == id)
                    .ok_or(DownloadError::NotFound)?
                    .running = running;
            }
            OrganizationCommand::PauseQueue { id } => {
                state
                    .queues
                    .iter_mut()
                    .find(|q| q.id == id)
                    .ok_or(DownloadError::NotFound)?
                    .running = false;
                pause = Some(id);
            }
            OrganizationCommand::CancelPower => {
                state.power_remaining = None;
                state.power_message = "Acción cancelada".into();
                for q in &mut state.queues {
                    q.power_armed = false;
                }
            }
            OrganizationCommand::ArmPower { id, power } => {
                let queue = state
                    .queues
                    .iter_mut()
                    .find(|q| q.id == id)
                    .ok_or(DownloadError::NotFound)?;
                queue.on_finish = power;
                queue.power_armed = queue.on_finish != PowerAction::None;
            }
        }
        let mut preferences = inner.preferences.clone();
        // Keep both snapshots and receipts well below the authenticated IPC frame limit.
        if serde_json::to_vec(&state)
            .map_err(|_| DownloadError::Storage)?
            .len()
            > 96 * 1024
        {
            return Err(DownloadError::Busy);
        }
        preferences.queue_running = state.queues.iter().any(|q| q.id == "main" && q.running);
        let reply = Payload::Organization {
            state: state.clone(),
        };
        inner.store.save_organization(
            &state,
            &changed,
            Some(&preferences),
            Some((request, &reply)),
        )?;
        inner.preferences = preferences;
        inner.organization = state;
        if !inner.organization.library.clipboard {
            inner.clipboard.poll(false, 0, || 0, || None);
        }
        // Every explicit organization edit cancels any pending countdown. Get returned above.
        if inner.power_countdown.take().is_some() {
            inner.organization.power_remaining = None;
            inner.organization.power_message =
                "Cuenta atrás cancelada por un cambio de organización.".into();
            inner
                .store
                .save_organization(&inner.organization, &[], None, None)?;
        }
        for job in changed {
            self.emit(&job);
            inner.jobs.insert(job.id.clone(), job);
        }
        if let Some(id) = pause {
            for (job_id, control) in &inner.active {
                if inner
                    .jobs
                    .get(job_id)
                    .is_some_and(|j| j.organization.queue_id == id)
                {
                    control.send_replace(Control::Pause);
                }
            }
        }
        self.pump(inner);
        Ok(Payload::Organization {
            state: inner.organization.clone(),
        })
    }
    pub(super) fn pump_queues(&self, inner: &mut Inner, capacity: usize) {
        let mut queues = inner.organization.queues.clone();
        queues.sort_by_key(|q| match q.priority {
            Priority::High => 0,
            Priority::Normal => 1,
            Priority::Low => 2,
        });
        if queues.is_empty() {
            return;
        }
        for _ in 0..capacity {
            let mut started = false;
            for n in 0..queues.len() {
                let i = (inner.queue_cursor + n) % queues.len();
                let queue = &queues[i];
                if !queue.running {
                    continue;
                }
                let active = inner
                    .active
                    .keys()
                    .filter(|id| {
                        inner
                            .jobs
                            .get(*id)
                            .is_some_and(|j| j.organization.queue_id == queue.id)
                    })
                    .count();
                if active >= queue.concurrency as usize {
                    continue;
                }
                let candidate = inner
                    .jobs
                    .values()
                    .filter(|j| {
                        j.state == TransferState::Queued
                            && j.organization.queue_id == queue.id
                            && !inner.active.contains_key(&j.id)
                    })
                    .min_by_key(|j| (j.organization.order, j.created_at, j.id.clone()))
                    .cloned();
                if let Some(job) = candidate {
                    if self.start(inner, job).is_ok() {
                        inner.queue_cursor = (i + 1) % queues.len();
                        started = true;
                    }
                    break;
                }
            }
            if !started {
                break;
            }
        }
    }
    pub fn tick(&self) {
        let Ok(mut inner) = self.inner.lock() else {
            return;
        };
        if inner.stopping {
            return;
        }
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut state = inner.organization.clone();
        let mut changed = false;
        for q in &mut state.queues {
            changed |= idg_core::organization::apply_schedule(q, now);
        }
        if changed {
            let mut prefs = inner.preferences.clone();
            prefs.queue_running = state.queues.iter().any(|q| q.id == "main" && q.running);
            if inner
                .store
                .save_organization(&state, &[], Some(&prefs), None)
                .is_err()
            {
                return;
            }
            inner.organization = state;
            inner.preferences = prefs;
        }
        self.pump(&mut inner);
        self.tick_library(&mut inner, now);
        let enabled = inner.organization.library.clipboard;
        let elapsed = inner.clock_origin.elapsed().as_secs();
        inner.clipboard.poll(
            enabled,
            elapsed,
            idg_platform_windows::clipboard::sequence,
            idg_platform_windows::clipboard::read_text,
        );
        self.tick_power(&mut inner);
    }
    fn tick_power(&self, inner: &mut Inner) {
        let seconds = inner.clock_origin.elapsed().as_secs();
        let clear = !inner.jobs.is_empty()
            && inner.active.is_empty()
            && inner.file_operations.is_empty()
            && inner.unavailable.is_empty()
            && inner
                .jobs
                .values()
                .all(|j| j.state == TransferState::Completed)
            && !inner.organization.queues.iter().any(|q| {
                q.schedule
                    .as_ref()
                    .is_some_and(|s| s.state == ScheduleState::Pending)
            });
        if inner.power_countdown.is_none() {
            let action = idg_core::power::candidate(
                &inner.organization,
                inner
                    .jobs
                    .values()
                    .map(|j| (j.organization.queue_id.as_str(), &j.state)),
                !clear,
            );
            if let Some(action) = action {
                let mut state = inner.organization.clone();
                // Consume activation durably BEFORE creating a countdown or invoking Windows.
                for q in &mut state.queues {
                    q.power_armed = false;
                }
                state.power_remaining = Some(60);
                state.power_message = match action {
                    PowerAction::Shutdown => "Apagar",
                    PowerAction::Suspend => "Suspender",
                    PowerAction::Hibernate => "Hibernar",
                    PowerAction::None => "Ninguna",
                }
                .into();
                if inner
                    .store
                    .save_organization(&state, &[], None, None)
                    .is_ok()
                {
                    inner.organization = state;
                    inner.power_countdown = Some(idg_core::power::Countdown::new(action, seconds));
                }
            }
            return;
        }
        let remaining = inner.power_countdown.as_ref().unwrap().remaining(seconds);
        inner.organization.power_remaining = Some(remaining);
        if !clear || remaining == 0 {
            let countdown = inner.power_countdown.take().unwrap();
            inner.organization.power_remaining = None;
            inner.organization.power_message = if clear {
                "Solicitud de energía consumida; no se repetirá."
            } else {
                "Acción cancelada: hay trabajos pendientes en IDG."
            }
            .into();
            if inner
                .store
                .save_organization(&inner.organization, &[], None, None)
                .is_err()
            {
                return;
            }
            if let Some(action) = countdown.finish(seconds, clear) {
                let result = idg_platform_windows::power::request_power(
                    &action,
                    inner.organization.power_simulated,
                );
                inner.organization.power_message=if result.is_err() {"Windows rechazó la solicitud de energía; revisa permisos y compatibilidad. No se reintentará."} else if inner.organization.power_simulated {"Simulación completada: no se envió ninguna acción a Windows."} else {"Windows aceptó la solicitud. Esto no confirma que haya completado la acción."}.into();
                let _ = inner
                    .store
                    .save_organization(&inner.organization, &[], None, None);
            }
        }
    }
}
