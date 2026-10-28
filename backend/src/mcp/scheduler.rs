//! 客户端自适应调度；这些边界是本地资源保护策略，不是飞书官方额度。
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, VecDeque},
    sync::{Arc, Mutex, OnceLock, Weak},
    time::Duration,
};
use tokio::{sync::Notify, time::Instant};

pub const MAX_PENDING_READS: usize = 128;
pub const CONNECT_TIMEOUT: Duration = Duration::from_secs(30);
pub const OPERATION_TIMEOUT: Duration = Duration::from_secs(120);
pub(super) const MAX_IN_FLIGHT: usize = 64;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Priority {
    Foreground = 0,
    Check = 1,
    Background = 2,
}

tokio::task_local! { static REQUEST_PRIORITY: Priority; }

pub(crate) async fn with_priority<F: std::future::Future>(
    priority: Priority,
    future: F,
) -> F::Output {
    REQUEST_PRIORITY.scope(priority, future).await
}

// 同类 FIFO；每轮给前台两次机会，检查与后台各一次，避免持续交互饿死同步。
const TURNS: [Priority; 4] = [
    Priority::Foreground,
    Priority::Check,
    Priority::Foreground,
    Priority::Background,
];

pub struct Scheduler {
    state: Mutex<State>,
    changed: Notify,
}

struct State {
    queue: [VecDeque<u64>; 3],
    turn: usize,
    ticket: u64,
    active: usize,
    active_by_priority: [usize; 3],
    limit: usize,
    epoch: u64,
    successes: usize,
    last_growth: Instant,
    next_start: Instant,
    next_background_start: Instant,
    blocked_until: Instant,
    latency: Duration,
    backoff: Duration,
    timings: HashMap<String, Timing>,
}

impl State {
    fn queued(&self) -> usize {
        self.queue.iter().map(VecDeque::len).sum()
    }

    fn candidate(&self) -> Option<(Priority, usize, Instant)> {
        // 一次选择必须基于同一时间快照，否则跨过发送时刻时可能改变队首候选者。
        let now = Instant::now();
        if self.active >= self.limit {
            return None;
        }
        let foreground_reserve = usize::from(self.limit >= 2);
        let check_reserve = usize::from(self.limit >= 3);
        let mut earliest = None;
        for offset in 0..TURNS.len() {
            let turn = (self.turn + offset) % TURNS.len();
            let priority = TURNS[turn];
            if self.queue[priority as usize].is_empty() {
                continue;
            }
            let non_foreground = self.active_by_priority[1] + self.active_by_priority[2];
            let eligible = match priority {
                Priority::Foreground => true,
                Priority::Check => non_foreground < self.limit - foreground_reserve,
                Priority::Background => {
                    non_foreground < self.limit - foreground_reserve
                        && self.active_by_priority[2]
                            < self.limit - foreground_reserve - check_reserve
                }
            };
            if !eligible {
                continue;
            }
            let mut wake = self.next_start.max(self.blocked_until);
            if priority == Priority::Background {
                wake = wake.max(self.next_background_start);
            }
            if wake <= now {
                return Some((priority, turn, wake));
            }
            if earliest.is_none_or(|(_, _, at)| wake < at) {
                earliest = Some((priority, turn, wake));
            }
        }
        earliest
    }
}

struct Timing {
    mean: f64,
    deviation: f64,
}

#[derive(Clone, Copy)]
pub enum Feedback {
    Success,
    Throttled(Option<Duration>),
    Congested,
    Failed,
}

impl Default for Scheduler {
    fn default() -> Self {
        let now = Instant::now();
        Self {
            state: Mutex::new(State {
                queue: std::array::from_fn(|_| VecDeque::new()),
                turn: 0,
                ticket: 0,
                active: 0,
                active_by_priority: [0; 3],
                limit: 8,
                epoch: 0,
                successes: 0,
                last_growth: now,
                next_start: now,
                next_background_start: now,
                blocked_until: now,
                latency: Duration::from_millis(500),
                backoff: Duration::from_secs(1),
                timings: HashMap::new(),
            }),
            changed: Notify::new(),
        }
    }
}

impl Scheduler {
    #[cfg(test)]
    pub(super) fn test_window(&self, limit: usize) {
        self.state.lock().unwrap().limit = limit;
    }

    #[cfg(test)]
    pub(super) fn active(&self) -> usize {
        self.state.lock().unwrap().active
    }

    #[cfg(test)]
    pub(super) fn queued(&self) -> usize {
        self.state.lock().unwrap().queued()
    }

    #[cfg(test)]
    pub(super) fn debug_state(&self) -> String {
        let state = self.state.lock().unwrap();
        format!("active={:?}, queued={:?}, limit={}, turn={}, candidate={:?}", state.active_by_priority,
            state.queue, state.limit, state.turn, state.candidate())
    }

    /// 同端点、同凭证的所有客户端（含显式连接检查）共享预算；注册表不保存凭证原文。
    pub fn shared(endpoint: &str, token: &str) -> Arc<Self> {
        type Key = (String, [u8; 32]);
        static REGISTRY: OnceLock<Mutex<HashMap<Key, Weak<Scheduler>>>> = OnceLock::new();
        let mut registry = REGISTRY.get_or_init(Mutex::default).lock().unwrap();
        registry.retain(|_, value| value.strong_count() > 0);
        let key = (endpoint.to_owned(), Sha256::digest(token.as_bytes()).into());
        if let Some(existing) = registry.get(&key).and_then(Weak::upgrade) {
            return existing;
        }
        let scheduler = Arc::new(Self::default());
        registry.insert(key, Arc::downgrade(&scheduler));
        scheduler
    }

    pub fn timeout(&self, tool: &str) -> Duration {
        let state = self.state.lock().unwrap();
        state.timings.get(tool).map_or(CONNECT_TIMEOUT, |t| {
            Duration::from_secs_f64((t.mean + 4.0 * t.deviation).clamp(10.0, 120.0))
        })
    }

    pub fn throttle(&self, delay: Option<Duration>) {
        let mut state = self.state.lock().unwrap();
        let now = Instant::now();
        let wait = delay
            .unwrap_or(state.backoff)
            .max(Duration::from_millis(100));
        if state.blocked_until <= now {
            state.limit = (state.limit / 2).max(1);
            state.epoch += 1;
            state.successes = 0;
            state.backoff = (state.backoff * 2).min(Duration::from_secs(30));
        }
        state.blocked_until = state
            .blocked_until
            .max(now.checked_add(wait).unwrap_or(now + OPERATION_TIMEOUT));
        drop(state);
        self.changed.notify_waiters();
    }

    pub async fn acquire(self: &Arc<Self>) -> Permit {
        let priority = REQUEST_PRIORITY
            .try_with(|p| *p)
            .unwrap_or(Priority::Foreground);
        let id = {
            let mut state = self.state.lock().unwrap();
            let id = state.ticket;
            state.ticket += 1;
            state.queue[priority as usize].push_back(id);
            id
        };
        // 新类别可能成为下一位发送者，唤醒原定时等待者以重新选举计时任务。
        self.changed.notify_waiters();
        let mut ticket = Ticket {
            scheduler: self.clone(),
            id,
            priority,
            waiting: true,
        };
        loop {
            let changed = self.changed.notified();
            tokio::pin!(changed);
            changed.as_mut().enable();
            let wake = {
                let mut state = self.state.lock().unwrap();
                let candidate = state.candidate();
                let selected = candidate.filter(|(lane, _, _)| {
                    *lane == priority && state.queue[priority as usize].front() == Some(&id)
                });
                if let Some((_, turn, _)) = selected.filter(|(_, _, at)| Instant::now() >= *at) {
                    let pressured = state.active + 1 >= state.limit || state.queued() > 1;
                    state.queue[priority as usize].pop_front();
                    state.turn = (turn + 1) % TURNS.len();
                    state.active += 1;
                    state.active_by_priority[priority as usize] += 1;
                    let gap = (state.latency / state.limit as u32).max(Duration::from_millis(10));
                    state.next_start = Instant::now() + Duration::from_millis(10);
                    if priority == Priority::Background {
                        state.next_background_start = Instant::now() + gap;
                    }
                    ticket.waiting = false;
                    let permit = Permit {
                        scheduler: self.clone(),
                        epoch: state.epoch,
                        pressured,
                        priority,
                    };
                    drop(state);
                    self.changed.notify_waiters();
                    return permit;
                }
                // 只有队首需要计时；并发满时由完成/取消唤醒，避免过期计时器忙等。
                selected.map(|(_, _, at)| at)
            };
            match wake {
                Some(at) => {
                    tokio::select! { _ = tokio::time::sleep_until(at) => {}, _ = &mut changed => {} }
                }
                None => changed.await,
            }
        }
    }
}

struct Ticket {
    scheduler: Arc<Scheduler>,
    id: u64,
    priority: Priority,
    waiting: bool,
}
impl Drop for Ticket {
    fn drop(&mut self) {
        if self.waiting {
            self.scheduler.state.lock().unwrap().queue[self.priority as usize]
                .retain(|id| *id != self.id);
            self.scheduler.changed.notify_waiters();
        }
    }
}

pub struct Permit {
    scheduler: Arc<Scheduler>,
    epoch: u64,
    pressured: bool,
    priority: Priority,
}
impl Permit {
    pub fn finish(&self, tool: &str, elapsed: Duration, feedback: Feedback) {
        let mut state = self.scheduler.state.lock().unwrap();
        let now = Instant::now();
        match feedback {
            Feedback::Throttled(delay) => {
                let wait = delay
                    .unwrap_or(state.backoff)
                    .max(Duration::from_millis(100));
                state.blocked_until = state
                    .blocked_until
                    .max(now.checked_add(wait).unwrap_or(now + OPERATION_TIMEOUT));
                if self.epoch == state.epoch {
                    state.limit = (state.limit / 2).max(1);
                    state.epoch += 1;
                    state.successes = 0;
                    state.backoff = (state.backoff * 2).min(Duration::from_secs(30));
                }
            }
            Feedback::Congested if self.epoch == state.epoch => {
                state.limit = (state.limit / 2).max(1);
                state.epoch += 1;
                state.successes = 0;
                // 超时后下次允许更长等待，仍受单次与整次操作上限约束。
                let timing = state.timings.entry(tool.into()).or_insert(Timing {
                    mean: 30.0,
                    deviation: 0.0,
                });
                timing.mean = (timing.mean * 2.0).min(120.0);
            }
            Feedback::Success if self.epoch == state.epoch => {
                let seconds = elapsed.as_secs_f64();
                let timing = state.timings.entry(tool.into()).or_insert(Timing {
                    mean: seconds,
                    deviation: seconds / 2.0,
                });
                timing.deviation = 0.75 * timing.deviation + 0.25 * (timing.mean - seconds).abs();
                timing.mean = 0.875 * timing.mean + 0.125 * seconds;
                state.latency = state.latency.mul_f64(0.875) + elapsed.mul_f64(0.125);
                state.backoff = Duration::from_secs(1);
                if self.pressured {
                    state.successes += 1;
                    if state.successes >= state.limit
                        && now.duration_since(state.last_growth) >= Duration::from_secs(1)
                    {
                        state.limit = (state.limit + 1).min(MAX_IN_FLIGHT);
                        state.successes = 0;
                        state.last_growth = now;
                    }
                }
            }
            _ => {}
        }
        drop(state);
        self.scheduler.changed.notify_waiters();
    }
}
impl Drop for Permit {
    fn drop(&mut self) {
        let mut state = self.scheduler.state.lock().unwrap();
        state.active -= 1;
        state.active_by_priority[self.priority as usize] -= 1;
        drop(state);
        self.scheduler.changed.notify_waiters();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn all_callers_share_a_bounded_window_and_recover_after_cancellation() {
        use std::sync::atomic::{AtomicUsize, Ordering};
        let scheduler = Arc::new(Scheduler::default());
        let active = Arc::new(AtomicUsize::new(0));
        let peak = Arc::new(AtomicUsize::new(0));
        let mut tasks = Vec::new();
        for _ in 0..160 {
            let scheduler = scheduler.clone();
            let active = active.clone();
            let peak = peak.clone();
            tasks.push(tokio::spawn(async move {
                let permit = scheduler.acquire().await;
                peak.fetch_max(active.fetch_add(1, Ordering::SeqCst) + 1, Ordering::SeqCst);
                tokio::time::sleep(Duration::from_secs(2)).await;
                active.fetch_sub(1, Ordering::SeqCst);
                permit.finish("read", Duration::from_secs(2), Feedback::Success);
            }));
        }
        for task in tasks {
            task.await.unwrap();
        }
        assert!(peak.load(Ordering::SeqCst) > 8);
        assert!(peak.load(Ordering::SeqCst) <= MAX_IN_FLIGHT);
        assert_eq!(scheduler.state.lock().unwrap().active, 0);
        assert!(Arc::ptr_eq(
            &Scheduler::shared("endpoint", "one"),
            &Scheduler::shared("endpoint", "one")
        ));
    }

    #[tokio::test(start_paused = true)]
    async fn grows_beyond_old_caps_then_throttles_and_ignores_stale_successes() {
        let scheduler = Arc::new(Scheduler::default());
        let tasks: Vec<_> = (0..240)
            .map(|_| {
                tokio::spawn({
                    let s = scheduler.clone();
                    async move {
                        let permit = s.acquire().await;
                        tokio::time::sleep(Duration::from_millis(500)).await;
                        permit.finish("read", Duration::from_millis(500), Feedback::Success);
                    }
                })
            })
            .collect();
        for task in tasks {
            task.await.unwrap();
        }
        assert!(scheduler.state.lock().unwrap().limit > 16);
        let stale = scheduler.acquire().await;
        let current = scheduler.acquire().await;
        current.finish(
            "read",
            Duration::ZERO,
            Feedback::Throttled(Some(Duration::from_secs(20))),
        );
        let limit = scheduler.state.lock().unwrap().limit;
        stale.finish("read", Duration::from_millis(1), Feedback::Success);
        assert_eq!(scheduler.state.lock().unwrap().limit, limit);
        let started = Instant::now();
        drop(current);
        drop(stale);
        let _permit = scheduler.acquire().await;
        assert!(started.elapsed() >= Duration::from_secs(20));
    }

    #[tokio::test(start_paused = true)]
    async fn cancellation_releases_queue_and_active_slots_and_timeout_adapts() {
        let scheduler = Arc::new(Scheduler::default());
        let permit = scheduler.acquire().await;
        permit.finish("slow", Duration::from_secs(20), Feedback::Success);
        assert!(scheduler.timeout("slow") > scheduler.timeout("unknown"));
        let waiting = tokio::spawn({
            let s = scheduler.clone();
            async move { s.acquire().await }
        });
        tokio::task::yield_now().await;
        waiting.abort();
        let _ = waiting.await;
        drop(permit);
        let next = scheduler.acquire().await;
        drop(next);
        let state = scheduler.state.lock().unwrap();
        assert_eq!(state.queued(), 0);
        assert_eq!(state.active, 0);
    }

    #[tokio::test(start_paused = true)]
    async fn every_lane_progresses_with_one_slot_and_cancellation_removes_its_ticket() {
        let scheduler = Arc::new(Scheduler::default());
        scheduler.test_window(1);
        let held = scheduler.acquire().await;
        let order = Arc::new(Mutex::new(Vec::new()));
        let mut tasks = Vec::new();
        for priority in [Priority::Background, Priority::Check, Priority::Foreground] {
            for index in 0..12 {
                let scheduler = scheduler.clone();
                let order = order.clone();
                tasks.push(tokio::spawn(with_priority(priority, async move {
                    let _permit = scheduler.acquire().await;
                    order.lock().unwrap().push((priority, index));
                    tokio::time::sleep(Duration::from_millis(20)).await;
                })));
            }
        }
        while scheduler.queued() < 36 {
            tokio::task::yield_now().await;
        }
        scheduler.throttle(Some(Duration::from_secs(2)));
        tasks[0].abort();
        let _ = (&mut tasks[0]).await;
        let started = Instant::now();
        drop(held);
        for task in tasks.into_iter().skip(1) {
            task.await.unwrap();
        }
        let order = order.lock().unwrap();
        assert_eq!(order.len(), 35);
        assert!(started.elapsed() >= Duration::from_secs(2));
        for priority in [Priority::Foreground, Priority::Check, Priority::Background] {
            assert!(
                order[..4].iter().any(|(p, _)| *p == priority),
                "每类持续积压时也要及时轮到 {priority:?}"
            );
            let indices: Vec<_> = order
                .iter()
                .filter(|(p, _)| *p == priority)
                .map(|(_, index)| *index)
                .collect();
            assert!(indices.windows(2).all(|w| w[0] < w[1]), "同类仍按FIFO发送");
        }
        assert_eq!(scheduler.queued(), 0);
        assert_eq!(scheduler.active(), 0);
    }

    #[tokio::test(start_paused = true)]
    async fn all_lanes_obey_the_same_cooldown_and_short_interactions_do_not_use_slow_detail_pacing()
    {
        let scheduler = Arc::new(Scheduler::default());
        let background = with_priority(Priority::Background, scheduler.acquire()).await;
        background.finish(
            "get_workitem_brief",
            Duration::from_secs(8),
            Feedback::Success,
        );
        drop(background);
        // 后台平均耗时很长，短前台链路仍只受共同最小间隔约束。
        let started = Instant::now();
        for _ in 0..5 {
            drop(scheduler.acquire().await);
        }
        assert!(started.elapsed() <= Duration::from_millis(60));
        scheduler.throttle(Some(Duration::from_secs(4)));
        let started = Instant::now();
        for priority in [Priority::Foreground, Priority::Check, Priority::Background] {
            drop(with_priority(priority, scheduler.acquire()).await);
            assert!(started.elapsed() >= Duration::from_secs(4));
        }
    }

    #[tokio::test(start_paused = true)]
    async fn background_can_still_grow_and_drain_while_interaction_positions_are_reserved() {
        let scheduler = Arc::new(Scheduler::default());
        let tasks: Vec<_> = (0..240)
            .map(|_| {
                let scheduler = scheduler.clone();
                tokio::spawn(with_priority(Priority::Background, async move {
                    let permit = scheduler.acquire().await;
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    permit.finish(
                        "get_workitem_brief",
                        Duration::from_millis(500),
                        Feedback::Success,
                    );
                }))
            })
            .collect();
        for task in tasks {
            task.await.unwrap();
        }
        assert!(scheduler.state.lock().unwrap().limit > 16);
        assert_eq!(scheduler.active(), 0);
        assert_eq!(scheduler.queued(), 0);
    }
}
