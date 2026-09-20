//! Opt-in, bounded, ephemeral proposals. No persistence, logging, or automatic downloads.
use sha2::{Digest, Sha256};
#[derive(Default)]
pub struct Monitor {
    sequence: Option<u32>,
    fingerprint: Option<[u8; 32]>,
    next: u32,
    pending: Option<Proposal>,
}
pub struct Proposal {
    pub id: u32,
    pub urls: Vec<String>,
    pub domains: Vec<String>,
    expires: u64,
}
impl Monitor {
    pub fn poll(
        &mut self,
        enabled: bool,
        now: u64,
        sequence: impl FnOnce() -> u32,
        read: impl FnOnce() -> Option<String>,
    ) {
        if !enabled {
            self.sequence = None;
            self.fingerprint = None;
            self.pending = None;
            return;
        }
        if self.pending.as_ref().is_some_and(|p| now >= p.expires) {
            self.pending = None;
        }
        let seq = sequence();
        let Some(previous) = self.sequence else {
            self.sequence = Some(seq);
            return;
        };
        if seq == previous {
            return;
        }
        let Some(text) = read() else {
            return;
        };
        self.sequence = Some(seq);
        if text.len() > 65536 {
            return;
        }
        let mut urls = Vec::new();
        let mut domains = Vec::new();
        for line in text.lines().take(1000) {
            let line = line.trim();
            if line.len() > 8192 {
                continue;
            }
            if let Ok(url) = reqwest::Url::parse(line)
                && matches!(url.scheme(), "http" | "https")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none()
                && !line.chars().any(char::is_whitespace)
            {
                if urls.iter().any(|s| s == line) {
                    continue;
                }
                urls.push(line.to_owned());
                domains.push(url.host_str().unwrap().to_owned());
                if urls.len() == 32 {
                    break;
                }
            }
        }
        let mut bytes = text.into_bytes();
        bytes.fill(0);
        if urls.is_empty() {
            return;
        }
        let fingerprint: [u8; 32] = Sha256::digest(urls.join("\n")).into();
        if self.fingerprint == Some(fingerprint) {
            return;
        }
        self.fingerprint = Some(fingerprint);
        self.next = self.next.wrapping_add(1);
        self.pending = Some(Proposal {
            id: self.next,
            urls,
            domains,
            expires: now.saturating_add(300),
        });
    }
    pub fn pending(&self) -> Option<&Proposal> {
        self.pending.as_ref()
    }
    pub fn take(&mut self, id: u32) -> Option<Vec<String>> {
        if self.pending.as_ref().is_some_and(|p| p.id == id) {
            self.pending.take().map(|p| p.urls)
        } else {
            None
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn off_never_observes_and_enabled_only_proposes_changes() {
        let mut m = Monitor::default();
        m.poll(
            false,
            0,
            || panic!("must not observe"),
            || panic!("must not read"),
        );
        m.poll(true, 0, || 1, || panic!("initial contents are not read"));
        m.poll(
            true,
            1,
            || 2,
            || Some("https://example.org/a?token=one".into()),
        );
        let id = m.pending().unwrap().id;
        assert_eq!(m.take(id).unwrap().len(), 1);
        m.poll(
            true,
            2,
            || 3,
            || Some("https://example.org/a?token=one".into()),
        );
        assert!(m.pending().is_none());
        m.poll(
            true,
            3,
            || 4,
            || Some("https://example.org/a?token=two".into()),
        );
        assert!(m.pending().is_some());
        m.poll(false, 4, || panic!("off"), || panic!("off"));
        assert!(m.pending().is_none());
    }
    #[test]
    fn proposals_expire_and_are_bounded() {
        let mut m = Monitor::default();
        m.poll(true, 0, || 0, || None);
        m.poll(
            true,
            1,
            || 1,
            || {
                Some(
                    (0..100)
                        .map(|n| format!("https://example.org/{n}\n"))
                        .collect(),
                )
            },
        );
        assert_eq!(m.pending().unwrap().urls.len(), 32);
        m.poll(true, 301, || 1, || panic!());
        assert!(m.pending().is_none());
    }
}
