use crate::download::Job;
use idg_protocol::{DownloadError, SearchQuery, TransferState};
/// Called once within the transaction that consumes a completed job's statistics marker.
/// Cycle rate includes queueing/pauses, not just network activity; no fabricated duration.
pub fn record_statistics(stats: &mut idg_protocol::LocalStatistics, job: &Job, now: u64) {
    if job.organization.private || job.state != TransferState::Completed {
        return;
    }
    let add = |old: &str, n: u64| {
        old.parse::<u64>()
            .unwrap_or(0)
            .saturating_add(n)
            .to_string()
    };
    stats.completed = stats.completed.saturating_add(1);
    stats.bytes = add(&stats.bytes, job.durable);
    if let Some(seconds) = now.checked_sub(job.created_at).filter(|n| *n > 0) {
        stats.timed_bytes = add(&stats.timed_bytes, job.durable);
        stats.cycle_seconds = add(&stats.cycle_seconds, seconds);
    }
    let domain = job.snapshot().domain;
    if let Some(site) = stats.sites.iter_mut().find(|s| s.domain == domain) {
        site.completed = site.completed.saturating_add(1);
    } else if stats.sites.len() < 32 && !domain.is_empty() && domain.len() <= 253 {
        stats.sites.push(idg_protocol::SiteStatistic {
            domain,
            completed: 1,
        });
    } else {
        stats.other_sites_completed = stats.other_sites_completed.saturating_add(1);
    }
    stats.sites.sort_by(|a, b| {
        b.completed
            .cmp(&a.completed)
            .then_with(|| a.domain.cmp(&b.domain))
    });
}
pub fn retention_due(job: &Job, days: Option<u32>, now: u64) -> bool {
    matches!(
        job.state,
        TransferState::Completed | TransferState::Cancelled
    ) && days
        .zip(job.organization.finished_at)
        .is_some_and(|(days, finished)| {
            let finished = finished.max(job.organization.history_visible_since.unwrap_or(0));
            now.saturating_sub(u64::from(finished)) >= u64::from(days) * 86400
        })
}
pub fn child_operation_id(root: &str, index: usize) -> String {
    use sha2::{Digest, Sha256};
    format!("{:x}", Sha256::digest(format!("{root}:{index}")))
}
pub fn duplicate(job: &Job, input: &idg_protocol::NewDownload, context: &str) -> bool {
    job.input.url == input.url
        && job.organization.context == context
        && input.expected_sha256.as_ref().is_none_or(|hash| {
            job.calculated_sha256
                .as_ref()
                .or(job.input.expected_sha256.as_ref())
                .is_none_or(|old| old.eq_ignore_ascii_case(hash))
        })
}
pub fn state_label(state: &TransferState) -> &'static str {
    match state {
        TransferState::Deferred => "Para después",
        TransferState::Queued => "En cola",
        TransferState::Probing => "Comprobando",
        TransferState::Downloading => "Descargando",
        TransferState::Paused => "Pausadas",
        TransferState::Verifying | TransferState::PublishPending => "Procesando",
        TransferState::Completed => "Completadas",
        TransferState::Failed => "Fallidas",
        TransferState::Cancelled => "Canceladas",
    }
}
fn day_start(date: &str) -> Option<u64> {
    let parts: Vec<_> = date.split('-').map(str::parse::<u32>).collect();
    if parts.len() != 3 {
        return None;
    }
    let (year, month, day) = (
        parts[0].as_ref().ok()?,
        parts[1].as_ref().ok()?,
        parts[2].as_ref().ok()?,
    );
    if !(1970..=2106).contains(year) || !(1..=12).contains(month) {
        return None;
    }
    let leap = |y: u32| y.is_multiple_of(4) && (!y.is_multiple_of(100) || y.is_multiple_of(400));
    let months = [
        31,
        if leap(*year) { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if *day == 0 || *day > months[*month as usize - 1] {
        return None;
    }
    let days = (1970..*year)
        .map(|y| if leap(y) { 366u64 } else { 365 })
        .sum::<u64>()
        + months[..*month as usize - 1]
            .iter()
            .map(|n| u64::from(*n))
            .sum::<u64>()
        + u64::from(*day)
        - 1;
    Some(days * 86400)
}
pub fn search<'a>(
    jobs: impl Iterator<Item = &'a Job>,
    query: &SearchQuery,
) -> Result<(Vec<String>, u32, Option<u32>), DownloadError> {
    if query.text.len() > 512
        || query.view.len() > 120
        || query.site.len() > 253
        || query.status.len() > 40
        || query.offset > 10000
    {
        return Err(DownloadError::InvalidInput);
    }
    let after = if query.after.is_empty() {
        None
    } else {
        Some(day_start(&query.after).ok_or(DownloadError::InvalidInput)?)
    };
    let words: Vec<_> = query
        .text
        .split_whitespace()
        .map(str::to_lowercase)
        .collect();
    let mut hits: Vec<_> = jobs
        .filter(|job| {
            let snapshot = job.snapshot();
            let label = state_label(&job.state);
            let category = snapshot.category.to_lowercase();
            let domain = snapshot.domain.to_lowercase();
            if (query.view == "Ocultas") != job.organization.hidden {
                return false;
            }
            if !["", "Todas", "Ocultas"].contains(&query.view.as_str())
                && query.view != label
                && query.view != snapshot.category
            {
                return false;
            }
            if !query.status.is_empty() && query.status != label {
                return false;
            }
            if !domain.contains(&query.site.to_lowercase())
                || after.is_some_and(|s| job.created_at < s)
            {
                return false;
            }
            if !size_match(job.total, &query.size) {
                return false;
            }
            // Do not search query strings, fragments, credentials, or arbitrary URL path tokens.
            // Origin is the safe URL component. Destination stays in the backend, never returned here.
            let haystack = format!(
                "{} {} {} {}",
                job.input.name, domain, category, job.input.directory
            )
            .to_lowercase();
            words.iter().all(|word| {
                if let Some(site) = word.strip_prefix("site:") {
                    domain.contains(site)
                } else if let Some(kind) = word.strip_prefix("type:") {
                    category == kind || job.input.name.to_lowercase().ends_with(&format!(".{kind}"))
                } else if let Some(status) = word.strip_prefix("status:") {
                    label.to_lowercase() == status
                        || format!("{:?}", job.state).to_lowercase() == status
                } else if let Some(size) = word.strip_prefix("size:") {
                    size_match(job.total, size)
                } else {
                    haystack.contains(word)
                }
            })
        })
        .collect();
    hits.sort_by_key(|j| (j.created_at, &j.id));
    let total = hits.len() as u32;
    let ids = hits
        .into_iter()
        .skip(query.offset as usize)
        .take(50)
        .map(|j| j.id.clone())
        .collect::<Vec<_>>();
    let next = query.offset.saturating_add(ids.len() as u32);
    Ok((ids, total, (next < total).then_some(next)))
}
fn size_match(size: Option<u64>, filter: &str) -> bool {
    match filter {
        "" => true,
        "unknown" => size.is_none(),
        "large" => size.is_some_and(|n| n >= 1024 * 1024 * 1024),
        "small" => size.is_some_and(|n| n < 1024 * 1024 * 1024),
        _ => false,
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn statistics_use_measured_cycle_time_safe_domains_and_bounded_counts() {
        let dir = tempfile::tempdir().unwrap();
        let mut job = crate::download::create_job(
            "stats",
            idg_protocol::NewDownload {
                url: "https://example.org/private?token=not-a-real-secret".into(),
                directory: dir.path().to_string_lossy().into(),
                name: "a.bin".into(),
                expected_sha256: None,
                conflict: idg_protocol::ConflictPolicy::Reject,
            },
        )
        .unwrap();
        job.state = TransferState::Completed;
        job.created_at = 100;
        job.durable = 4096;
        let mut stats = idg_protocol::LocalStatistics::default();
        record_statistics(&mut stats, &job, 104);
        assert_eq!(stats.bytes, "4096");
        assert_eq!(stats.timed_bytes, "4096");
        assert_eq!(stats.cycle_seconds, "4");
        assert_eq!(stats.sites[0].domain, "example.org");
        job.organization.private = true;
        record_statistics(&mut stats, &job, 105);
        assert_eq!(stats.completed, 1);
        job.organization.private = false;
        record_statistics(&mut stats, &job, 99); // Rewound clock: no fake one-second sample.
        assert_eq!(stats.cycle_seconds, "4");
        assert_eq!(stats.timed_bytes, "4096");
        for n in 0..40 {
            job.input.url = format!("https://site{n}.example.org/f");
            record_statistics(&mut stats, &job, 106);
        }
        assert_eq!(stats.sites.len(), 32);
        assert_eq!(stats.other_sites_completed, 9);
        assert_eq!(
            stats.sites.iter().map(|s| s.completed).sum::<u32>() + stats.other_sites_completed,
            stats.completed
        );
    }
    #[test]
    fn global_search_pages_unicode_literals_and_sensitive_url_is_excluded() {
        let dir = tempfile::tempdir().unwrap();
        let mut jobs = Vec::new();
        for n in 0..61 {
            let mut job = crate::download::create_job(
                &format!("job{n:03}"),
                idg_protocol::NewDownload {
                    url: format!("https://example.org/private?token=secret-{n}"),
                    directory: dir.path().to_string_lossy().into(),
                    name: format!("Árbol [{n}].txt"),
                    expected_sha256: None,
                    conflict: idg_protocol::ConflictPolicy::Reject,
                },
            )
            .unwrap();
            job.created_at = n;
            job.organization.category = Some("Lecturas".into());
            jobs.push(job);
        }
        let mut query = SearchQuery {
            text: "ÁRBOL site:example.org type:txt".into(),
            ..Default::default()
        };
        let (first, total, next) = search(jobs.iter(), &query).unwrap();
        assert_eq!(first.len(), 50);
        assert_eq!(total, 61);
        assert_eq!(next, Some(50));
        query.offset = 50;
        let (last, _, next) = search(jobs.iter(), &query).unwrap();
        assert_eq!(last.len(), 11);
        assert_eq!(next, None);
        assert!(!first.iter().any(|id| last.contains(id)));
        query.offset = 0;
        query.text = "[60]".into();
        assert_eq!(search(jobs.iter(), &query).unwrap().0, vec!["job060"]);
        for literal in ["secret-1", "token=", "'; DROP TABLE downloads; --"] {
            query.text = literal.into();
            assert_eq!(search(jobs.iter(), &query).unwrap().1, 0);
        }
        query.text = "Lecturas".into();
        assert_eq!(search(jobs.iter(), &query).unwrap().1, 61);
    }
    #[test]
    fn duplicates_keep_full_tokens_and_context_separate() {
        let dir = tempfile::tempdir().unwrap();
        let input = idg_protocol::NewDownload {
            url: "https://example.org/file?token=one".into(),
            directory: dir.path().to_string_lossy().into(),
            name: "a.bin".into(),
            expected_sha256: None,
            conflict: idg_protocol::ConflictPolicy::Reject,
        };
        let job = crate::download::create_job("one", input.clone()).unwrap();
        assert!(duplicate(&job, &input, ""));
        assert!(!duplicate(&job, &input, "different-browser-context"));
        let mut other = input;
        other.url = "https://example.org/file?token=two".into();
        assert!(!duplicate(&job, &other, ""));
        let mut job = job;
        job.state = TransferState::Completed;
        job.organization.finished_at = Some(100);
        assert!(!retention_due(&job, None, 100000));
        assert!(!retention_due(&job, Some(1), 86499));
        assert!(retention_due(&job, Some(1), 86500));
        assert!(!retention_due(&job, Some(1), 99));
        job.state = TransferState::Paused;
        assert!(!retention_due(&job, Some(1), 100000));
    }
    #[test]
    fn date_and_unknown_size_are_validated() {
        assert_eq!(day_start("1970-01-01"), Some(0));
        assert!(day_start("2025-02-29").is_none());
        assert!(day_start("2024-02-29").is_some());
        assert!(!size_match(None, "small"));
        assert!(size_match(None, "unknown"));
    }
}
