import { expect, it, vi } from "vitest";
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
import { closeScheduleSession, loadSchedulePeople, loadScheduleSession, resetScheduleSession, submitScheduleTargets } from "./scheduleApi";

it("桌面会话先结束旧会话再读取新会话，写入只传目标 ID 和日期", async () => {
  const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "me" };
  const wire = { session_id: "s1", current_user: "me", current_user_name: "本人", read_at_ms: 1, sources: [{ id: "a", name: "来源", complete: true }], failed_items: 0, targets: [{ id: "1", identity, title: "标题", node_name: "开发", owners: [{ id: "me", name: "本人" }], sources: ["a"], baseline: { start: "", end: "" } }] };
  invoke.mockImplementation(async (command: string) => command === "load_schedule_session" ? wire : command === "sync_schedule_session" ? { targets: [{ id: "1", result: "accepted" }], write_requests: 1 } : undefined);
  const first = loadScheduleSession(); const closed = closeScheduleSession(first);
  const read = await first; await closed; await loadScheduleSession();
  expect(invoke.mock.calls.map((call) => call[0])).toEqual(["load_schedule_session", "close_schedule_session", "load_schedule_session"]);
  expect(read.targets[0].mine).toBe(true);
  expect(read.targets[0].identity).toEqual(identity);
  await submitScheduleTargets("s1", [{ id: "1", identity, dates: { start: "2026-11-13", end: "2026-11-14" }, cancel: false }]);
  expect(invoke).toHaveBeenLastCalledWith("sync_schedule_session", { sessionId: "s1", changes: [{ id: "1", start: "2026-11-13", end: "2026-11-14", cancel: false }] });
});

it("传递账号识别错误，不把空账号或空负责人误认作本人", async () => {
  invoke.mockResolvedValueOnce({ session_id: "s2", current_user: "", current_user_name: "", account_error: "未能确认当前飞书账号", read_at_ms: 1, sources: [], failed_items: 0, targets: [{ id: "1", identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "node", owner: "" }, title: "标题", node_name: "开发", owners: [], sources: [], baseline: { start: "", end: "" } }] });
  const read = await loadScheduleSession();
  expect(read.accountError).toBe("未能确认当前飞书账号");
  expect(read.targets[0].mine).toBe(false);
  expect(read.people).toEqual([]);
});

it("保留来源聚合标记并确保无负责人时只读", async () => {
  invoke.mockResolvedValueOnce({ session_id: "s3", current_user: "me", current_user_name: "本人", read_at_ms: 1, sources: [], failed_items: 1, targets: [{ id: "aggregate", identity: { connection: "c", project: "p", type: "t", item: "i", node: "", scope: "node", owner: null }, title: "标题", node_name: "开发", owners: [], sources: ["s"], baseline: { start: "2026-11-12", end: "2026-11-12" }, source_aggregate: true }] });
  const target = (await loadScheduleSession()).targets[0];
  expect(target.sourceAggregate).toBe(true);
  expect(target.ownerIds).toEqual([]);
  expect(target.ownerId).toBeNull();
  expect(target.mine).toBe(false);
  expect(target.readOnlyReason).toContain("仅供查看");
});

it("保留来源完整性及事项失败的来源归属", async () => {
  invoke.mockResolvedValueOnce({ session_id: "s4", current_user: "me", current_user_name: "本人", read_at_ms: 1, sources: [{ id: "a", name: "完整来源", complete: true }, { id: "b", name: "失败来源", complete: false, error: "读取失败" }], failed_items: 1, item_errors: [{ project: "p", type: "t", item: "i", sources: ["b"], message: "详情读取失败" }], targets: [] });
  const read = await loadScheduleSession();
  expect(read.sources.map((source) => source.complete)).toEqual([true, false]);
  expect(read.complete).toBe(false);
  expect(read.itemErrors?.[0].sources).toEqual(["b"]);
});

it.each([
  [[], 0, false],
  [[{ id: "a", name: "来源", complete: true }], 0, true],
  [[{ id: "a", name: "来源", complete: false }], 0, false],
  [[{ id: "a", name: "来源", complete: true }], 1, false],
])("来源和事项失败数共同决定读取完整性", async (sources, failed_items, complete) => {
  invoke.mockResolvedValueOnce({ session_id: "scope", current_user: "me", current_user_name: "本人", read_at_ms: 1, sources, failed_items, targets: [] });
  expect((await loadScheduleSession()).complete).toBe(complete);
});

it("按 ID 合并人员时姓名优先于完整或短 ID，同名人员保持独立", async () => {
  const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal", owner: "user-123456" };
  const target = (id: string, name: string) => ({ id: `${id}-${name}`, identity, title: "标题", node_name: "节点", owners: [{ id, name }], sources: [], baseline: { start: "", end: "" } });
  invoke.mockResolvedValueOnce({ session_id: "names", current_user: "user-123456", current_user_name: "真实姓名", read_at_ms: 1, sources: [], failed_items: 0, targets: [target("user-123456", "123456"), target("user-123456", "user-123456"), target("other-123456", "真实姓名"), target("third-654321", "654321"), target("third-654321", "同事") ] });
  const read = await loadScheduleSession();
  expect(read.people).toEqual(expect.arrayContaining([expect.objectContaining({ id: "user-123456", name: "真实姓名" }), expect.objectContaining({ id: "other-123456", name: "真实姓名" }), expect.objectContaining({ id: "third-654321", name: "同事" })]));
  expect(read.people).toHaveLength(4);
});

it("同 ID 的人员资料按连接和真实空间隔离", async () => {
  const target = (project: string, name: string, avatar: string) => ({ id: project, identity: { connection: "c", project, type: "t", item: "i", node: "n", scope: "personal", owner: "same" }, title: "任务", node_name: "节点", owners: [{ id: "same", name, avatar }], sources: [], baseline: { start: "", end: "" } });
  invoke.mockResolvedValueOnce({ session_id: "scoped", current_user: "", current_user_name: "", read_at_ms: 1, sources: [], failed_items: 0, targets: [target("p1", "甲", "a.png"), target("p2", "乙", "b.png")] });
  const read = await loadScheduleSession();
  expect(read.people).toEqual(expect.arrayContaining([expect.objectContaining({ id: "same", project: "p1", name: "甲", avatar: "a.png" }), expect.objectContaining({ id: "same", project: "p2", name: "乙", avatar: "b.png" })]));
});

it("经 IPC 保留共同排期中身份不明的负责人标志", async () => {
  invoke.mockResolvedValueOnce({ session_id: "unknown", current_user: "me", current_user_name: "本人", read_at_ms: 1, sources: [], failed_items: 0, targets: [{ id: "n", identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "node", owner: null }, title: "任务", node_name: "节点", owners: [{ id: "me", name: "本人" }], unknown_owner: true, sources: [], baseline: { start: "", end: "" }, read_only_reason: "只读" }] });
  const target = (await loadScheduleSession()).targets[0];
  expect(target.unknownOwner).toBe(true);
  expect(target.ownerIds).toEqual(["me"]);
  expect(target.readOnlyReason).toBe("只读");
});

it("保留详情缓存节点状态、来源和抓取时间", async () => {
  invoke.mockResolvedValueOnce({ session_id: "local", current_user: "", current_user_name: "", read_at_ms: 1000, sources: [], failed_items: 0, targets: [{ id: "n", identity: { connection: "", project: "p", type: "t", item: "i", node: "", scope: "node", owner: null }, title: "事项", node_name: "节点", owners: [], sources: ["a", "b"], baseline: { start: "", end: "" }, cache_kind: "detail_node", start_state: "missing", end_state: "empty", fetched_at_ms: 2000, read_only_reason: "只读" }] });
  const target = (await loadScheduleSession()).targets[0];
  expect(target).toMatchObject({ cacheKind: "detail_node", startState: "missing", endState: "empty", sourceIds: ["a", "b"], fetchedAt: new Date(2000).toLocaleString(), readOnlyReason: "只读" });
});

it("支持分层预加载参数与按需加载团队成员排期，并用当前用户真实姓名与头像升级本人空间条目", async () => {
  const identity = { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal" as const, owner: "1000000000000123456" };
  invoke.mockResolvedValueOnce({
    session_id: "s-mine",
    current_user: "1000000000000123456",
    current_user_name: "张晓明",
    current_user_avatar: "https://example.com/me.png",
    people_loaded: false,
    read_at_ms: 1000,
    sources: [{ id: "s", name: "个人待办", complete: true }],
    failed_items: 0,
    item_errors: [{ project: "p", type: "t", item: "i2", title: "登录异常", sources: ["s"], message: "读取未完成" }],
    targets: [
      { id: "1", identity, title: "我的节点", node_name: "开发", node_status: "doing", node_order: 2, owners: [{ id: "1000000000000123456", name: "123456" }], unknown_owner: false, sources: ["s"], baseline: { start: "", end: "" }, source_aggregate: false },
      { id: "no-req", identity: { ...identity, node: "n-merge" }, title: "我的节点", node_name: "代码合入", node_status: "doing", node_order: 3, schedule_required: false, owners: [{ id: "1000000000000123456", name: "123456" }], unknown_owner: false, sources: ["s"], baseline: { start: "", end: "" }, source_aggregate: false },
    ],
  });
  const mineRead = await loadScheduleSession({ includePeople: false });
  expect(invoke).toHaveBeenLastCalledWith("load_schedule_session", { includePeople: false });
  expect(mineRead.peopleLoaded).toBe(false);
  expect(mineRead.currentUserAvatar).toBe("https://example.com/me.png");
  expect(mineRead.itemErrors?.[0].title).toBe("登录异常");
  expect(mineRead.targets[0].nodeStatus).toBe("doing");
  expect(mineRead.targets[0].nodeOrder).toBe(2);
  expect(mineRead.targets[0].scheduleRequired).toBe(true);
  expect(mineRead.targets[1].scheduleRequired).toBe(false);
  expect(mineRead.people).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "1000000000000123456", project: "p", name: "张晓明", avatar: "https://example.com/me.png" }),
      expect.objectContaining({ id: "1000000000000123456", name: "张晓明", avatar: "https://example.com/me.png" }),
    ]),
  );

  invoke.mockResolvedValueOnce({
    session_id: "s-mine",
    current_user: "1000000000000123456",
    current_user_name: "张晓明",
    current_user_avatar: "https://example.com/me.png",
    people_loaded: true,
    read_at_ms: 2000,
    sources: [{ id: "s", name: "个人待办", complete: true }],
    failed_items: 0,
    targets: [
      { id: "1", identity, title: "我的节点", node_name: "开发", owners: [{ id: "1000000000000123456", name: "张晓明", avatar: "https://example.com/me.png" }], unknown_owner: false, sources: ["s"], baseline: { start: "", end: "" }, source_aggregate: false },
      { id: "2", identity: { ...identity, owner: "peer-1" }, title: "同事节点", node_name: "联调", owners: [{ id: "peer-1", name: "王敏", avatar: "https://example.com/peer.png" }], unknown_owner: false, sources: ["s"], baseline: { start: "2026-11-16", end: "2026-11-18" }, source_aggregate: false },
    ],
  });
  const allRead = await loadSchedulePeople("s-mine");
  expect(invoke).toHaveBeenLastCalledWith("load_schedule_people", { sessionId: "s-mine" });
  expect(allRead.peopleLoaded).toBe(true);
  expect(allRead.targets).toHaveLength(2);

  // 当前用户姓名为空或尾号兜底且空间也未解析出真实姓名时，全局条目显示“当前用户”而非裸 ID
  invoke.mockResolvedValueOnce({
    session_id: "s-fallback-user",
    current_user: "1000000000000123456",
    current_user_name: "123456",
    read_at_ms: 3000,
    sources: [],
    failed_items: 0,
    targets: [],
  });
  const fallbackRead = await loadScheduleSession({ includePeople: false });
  expect(fallbackRead.people).toEqual([
    expect.objectContaining({ id: "1000000000000123456", name: "当前用户" }),
  ]);
});

it("提交排期与关闭、重置会话按生命周期串行排队，避免 WouldBlock 冲突", async () => {
  invoke.mockReset();
  const order: string[] = [];
  let resolveSync!: (value: unknown) => void;
  invoke.mockImplementation((command: string) => {
    order.push(command);
    if (command === "sync_schedule_session") {
      return new Promise((resolve) => {
        resolveSync = resolve;
      });
    }
    return Promise.resolve(undefined);
  });

  const readPromise = Promise.resolve({
    sessionId: "s-queue",
    currentUserId: "me",
    readAt: "",
    complete: true,
    sources: [],
    people: [],
    targets: [],
  });
  const syncPromise = submitScheduleTargets("s-queue", [
    {
      id: "1",
      identity: { connection: "c", project: "p", type: "t", item: "i", node: "n", scope: "personal", owner: "me" },
      dates: { start: "2026-11-16", end: "2026-11-17" },
      cancel: false,
    },
  ]);
  const closePromise = closeScheduleSession(readPromise);
  // 先解析会话依赖，再进入 IPC 队列；队列不能被尚未创建的会话占住。
  await Promise.resolve();
  await Promise.resolve();
  const resetPromise = resetScheduleSession({ force: true });

  await Promise.resolve();
  expect(order).toEqual(["sync_schedule_session"]);

  resolveSync({ targets: [{ id: "1", result: "accepted" }], write_requests: 1 });
  await Promise.all([syncPromise, closePromise, resetPromise]);

  expect(order).toEqual(["sync_schedule_session", "close_schedule_session", "reset_schedule_session"]);
  expect(invoke).toHaveBeenLastCalledWith("reset_schedule_session", { force: true });
});

it("连续三轮会话替换不会因关闭操作等待尚未入队的读取而死锁", async () => {
  invoke.mockReset();
  let finishFirst!: () => void;
  let reads = 0;
  invoke.mockImplementation(async (command: string) => {
    if (command !== "load_schedule_session") return;
    const index = ++reads;
    if (index === 1) await new Promise<void>((resolve) => { finishFirst = resolve; });
    return { session_id: `s${index}`, current_user: "me", current_user_name: "本人", read_at_ms: index, sources: [], failed_items: 0, targets: [] };
  });
  const replace = async (previous: ReturnType<typeof loadScheduleSession> | null) => {
    if (previous) await closeScheduleSession(previous);
    return loadScheduleSession({ includePeople: false });
  };
  const first = replace(null);
  await vi.waitFor(() => expect(finishFirst).toBeTypeOf("function"));
  const second = replace(first);
  const third = replace(second);
  finishFirst();
  expect((await Promise.all([first, second, third])).map((read) => read.sessionId)).toEqual(["s1", "s2", "s3"]);
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    "load_schedule_session", "close_schedule_session", "load_schedule_session", "close_schedule_session", "load_schedule_session",
  ]);
});
