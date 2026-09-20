//! Process-wide admission and byte pacing, shared by all transfer executors.
use super::*;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tokio::sync::{Notify, watch};

struct Ticket {
    job: String,
    origin: String,
    priority: Priority,
    since: Instant,
    granted: bool,
}
struct State {
    limits: ResourceLimits,
    next: u64,
    tickets: BTreeMap<u64, Ticket>,
    global_tokens: (Instant, f64),
    files: BTreeMap<String, (Instant, f64)>,
    cooldowns: BTreeMap<String, Instant>,
}
pub struct Resources {
    state: Mutex<State>,
    changed: Notify,
}
pub struct Permit {
    resources: Arc<Resources>,
    id: u64,
}
impl Drop for Permit {
    fn drop(&mut self) {
        self.resources
            .state
            .lock()
            .unwrap()
            .tickets
            .remove(&self.id);
        self.resources.changed.notify_waiters();
    }
}

pub async fn interrupted(control: &mut watch::Receiver<Control>) {
    loop {
        if *control.borrow() != Control::Run {
            return;
        }
        if control.changed().await.is_err() {
            return;
        }
    }
}
pub async fn delay(
    duration: Duration,
    control: &mut watch::Receiver<Control>,
) -> Result<(), DownloadError> {
    tokio::select! {biased; _=interrupted(control)=>Err(DownloadError::InvalidState),_=tokio::time::sleep(duration)=>Ok(())}
}
impl Resources {
    pub fn new(limits: ResourceLimits) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(State {
                limits,
                next: 0,
                tickets: BTreeMap::new(),
                global_tokens: (Instant::now(), 0.0),
                files: BTreeMap::new(),
                cooldowns: BTreeMap::new(),
            }),
            changed: Notify::new(),
        })
    }
    pub fn limits(&self) -> ResourceLimits {
        self.state.lock().unwrap().limits.clone()
    }
    pub fn active_for(&self, id: &str) -> u32 {
        self.state
            .lock()
            .unwrap()
            .tickets
            .values()
            .filter(|t| t.granted && t.job == id)
            .count() as u32
    }
    pub fn update(&self, limits: ResourceLimits) -> Result<(), DownloadError> {
        limits.validate()?;
        let mut s = self.state.lock().unwrap();
        s.limits = limits;
        s.global_tokens = (Instant::now(), 0.0);
        drop(s);
        self.changed.notify_waiters();
        Ok(())
    }
    pub fn forget_file(&self, id: &str) {
        self.state.lock().unwrap().files.remove(id);
    }
    pub fn defer_origin(&self, origin: &str, wait: Duration) {
        let mut s = self.state.lock().unwrap();
        let deadline = Instant::now() + wait.min(Duration::from_secs(3600));
        let old = s.cooldowns.entry(origin.into()).or_insert(deadline);
        *old = (*old).max(deadline);
        drop(s);
        self.changed.notify_waiters();
    }
    pub async fn acquire(
        self: &Arc<Self>,
        job: &str,
        origin: &str,
        priority: Priority,
        control: &mut watch::Receiver<Control>,
    ) -> Result<Permit, DownloadError> {
        let id = {
            let mut s = self.state.lock().unwrap();
            s.cooldowns.retain(|_, t| *t > Instant::now());
            let id = s.next;
            s.next += 1;
            s.tickets.insert(
                id,
                Ticket {
                    job: job.into(),
                    origin: origin.into(),
                    priority,
                    since: Instant::now(),
                    granted: false,
                },
            );
            id
        };
        let permit = Permit {
            resources: self.clone(),
            id,
        };
        self.changed.notify_waiters();
        loop {
            let notified = self.changed.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if *control.borrow() != Control::Run {
                return Err(DownloadError::InvalidState);
            }
            let granted = {
                let mut s = self.state.lock().unwrap();
                let active = s.tickets.values().filter(|t| t.granted).count();
                let best = if active < s.limits.global_requests as usize {
                    s.tickets
                        .iter()
                        .filter(|(_, t)| {
                            !t.granted
                                && s.cooldowns
                                    .get(&t.origin)
                                    .is_none_or(|due| *due <= Instant::now())
                                && s.tickets
                                    .values()
                                    .filter(|a| a.granted && a.origin == t.origin)
                                    .count()
                                    < (s.limits.origin_requests as usize)
                        })
                        .max_by_key(|(id, t)| {
                            (
                                t.since.elapsed().as_millis()
                                    + match t.priority {
                                        Priority::High => 100,
                                        Priority::Normal => 50,
                                        Priority::Low => 0,
                                    },
                                std::cmp::Reverse(**id),
                            )
                        })
                        .map(|(id, _)| *id)
                } else {
                    None
                };
                if best == Some(id) {
                    s.tickets.get_mut(&id).unwrap().granted = true;
                    true
                } else {
                    false
                }
            };
            if granted {
                self.changed.notify_waiters();
                return Ok(permit);
            }
            tokio::select! {biased;_=interrupted(control)=>return Err(DownloadError::InvalidState),_=&mut notified=>{},_=tokio::time::sleep(Duration::from_millis(100))=>{}}
        }
    }
    pub async fn pace(
        &self,
        id: &str,
        individual: Option<u32>,
        bytes: usize,
        control: &mut watch::Receiver<Control>,
    ) -> Result<(), DownloadError> {
        fn refill(bucket: &mut (Instant, f64), rate: u32) {
            let now = Instant::now();
            bucket.1 =
                (bucket.1 + now.duration_since(bucket.0).as_secs_f64() * rate as f64).min(65536.0);
            bucket.0 = now;
        }
        loop {
            if *control.borrow() != Control::Run {
                return Err(DownloadError::InvalidState);
            }
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let wait = {
                let mut s = self.state.lock().unwrap();
                let mut wait = 0.0f64;
                if let Some(rate) = s.limits.bytes_per_second {
                    refill(&mut s.global_tokens, rate);
                    wait = wait.max((bytes as f64 - s.global_tokens.1).max(0.0) / rate as f64);
                }
                if let Some(rate) = individual {
                    let b = s.files.entry(id.into()).or_insert((Instant::now(), 0.0));
                    refill(b, rate);
                    wait = wait.max((bytes as f64 - b.1).max(0.0) / rate as f64);
                }
                if wait == 0.0 {
                    if s.limits.bytes_per_second.is_some() {
                        s.global_tokens.1 -= bytes as f64;
                    }
                    if individual.is_some() {
                        s.files.get_mut(id).unwrap().1 -= bytes as f64;
                    }
                }
                wait
            };
            if wait == 0.0 {
                return Ok(());
            }
            tokio::select! {biased;_=interrupted(control)=>return Err(DownloadError::InvalidState),_=&mut changed=>{},_=tokio::time::sleep(Duration::from_secs_f64(wait))=>{}}
        }
    }
}

/// Throughput trial with two measured windows, hysteresis and pressure reduction.
pub struct Adaptive {
    pub target: u32,
    cap: u32,
    baseline: f64,
    stable: u32,
    trial: Option<(u32, f64, u32)>,
    cooldown: u32,
}
impl Adaptive {
    pub fn new(cap: u32) -> Self {
        Self {
            target: 2.min(cap),
            cap,
            baseline: 0.0,
            stable: 0,
            trial: None,
            cooldown: 0,
        }
    }
    pub fn sample(&mut self, useful_per_second: f64, pressure: bool) {
        if pressure {
            self.target = (self.target / 2).max(1);
            self.trial = None;
            self.stable = 0;
            self.cooldown = 3;
            self.baseline = useful_per_second;
            return;
        }
        if self.cooldown > 0 {
            self.cooldown -= 1;
            self.baseline = useful_per_second;
            return;
        }
        if let Some((old, rate, good)) = self.trial {
            if useful_per_second >= rate * 1.10 {
                if good >= 1 {
                    self.trial = None;
                    self.baseline = useful_per_second;
                    self.cooldown = 2;
                } else {
                    self.trial = Some((old, rate, good + 1));
                }
            } else {
                self.target = old;
                self.trial = None;
                self.cooldown = 4;
                self.baseline = useful_per_second;
            }
            return;
        }
        if self.baseline > 0.0 && useful_per_second >= self.baseline * 0.95 {
            self.stable += 1;
        } else {
            self.stable = 0;
        }
        self.baseline = useful_per_second;
        if self.stable >= 2 && self.target < self.cap && useful_per_second > 0.0 {
            let old = self.target;
            self.target += 1;
            self.trial = Some((old, useful_per_second, 0));
            self.stable = 0;
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn automatic_requires_measurements_and_rejects_flat_trials() {
        let mut a = Adaptive::new(8);
        for _ in 0..3 {
            a.sample(100.0, false);
        }
        assert_eq!(a.target, 3);
        a.sample(100.0, false);
        assert_eq!(a.target, 2);
        for _ in 0..6 {
            a.sample(100.0, false);
        }
        assert_eq!(a.target, 3);
        a.sample(140.0, false);
        a.sample(145.0, false);
        assert_eq!(a.target, 3);
        a.sample(140.0, true);
        assert_eq!(a.target, 1);
    }
    #[tokio::test]
    async fn pending_permit_and_rate_wait_cancel_without_leaks() {
        let r = Resources::new(ResourceLimits {
            global_requests: 1,
            ..Default::default()
        });
        let (tx, mut c) = watch::channel(Control::Run);
        let first = r
            .acquire("first", "origin", Priority::Normal, &mut c)
            .await
            .unwrap();
        let r2 = r.clone();
        let mut c2 = c.clone();
        let waiting = tokio::spawn(async move {
            r2.acquire("second", "origin", Priority::High, &mut c2)
                .await
        });
        tokio::task::yield_now().await;
        tx.send_replace(Control::Cancel);
        assert!(waiting.await.unwrap().is_err());
        drop(first);
        assert!(r.state.lock().unwrap().tickets.is_empty());
        assert!(r.pace("job", Some(1), 65536, &mut c).await.is_err());
    }
    #[tokio::test]
    async fn global_origin_budgets_and_priority_progress() {
        let resources = Resources::new(ResourceLimits {
            global_requests: 4,
            origin_requests: 2,
            ..Default::default()
        });
        let (_tx, c) = watch::channel(Control::Run);
        let mut tasks = tokio::task::JoinSet::new();
        for id in 0..30 {
            let r = resources.clone();
            let mut control = c.clone();
            tasks.spawn(async move {
                let origin = if id % 2 == 0 { "one" } else { "two" };
                let priority = match id % 3 {
                    0 => Priority::High,
                    1 => Priority::Normal,
                    _ => Priority::Low,
                };
                let _permit = r
                    .acquire(&id.to_string(), origin, priority, &mut control)
                    .await
                    .unwrap();
                {
                    let state = r.state.lock().unwrap();
                    assert!(state.tickets.values().filter(|t| t.granted).count() <= 4);
                    assert!(
                        state
                            .tickets
                            .values()
                            .filter(|t| t.granted && t.origin == origin)
                            .count()
                            <= 2
                    );
                }
                assert_eq!(r.active_for(&id.to_string()), 1);
                tokio::time::sleep(Duration::from_millis(2)).await;
            });
        }
        tokio::time::timeout(Duration::from_secs(5), async {
            while let Some(result) = tasks.join_next().await {
                result.unwrap();
            }
        })
        .await
        .unwrap();
        assert!(resources.state.lock().unwrap().tickets.is_empty());
    }
}
