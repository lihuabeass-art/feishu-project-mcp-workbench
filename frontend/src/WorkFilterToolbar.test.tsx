// @vitest-environment jsdom
import { useState, type ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkFilterToolbar } from "./WorkFilterToolbar";
import { FilterSchemeMenu } from "./FilterSchemeMenu";
import type { FilterSchemesController } from "./useFilterSchemes";
import { emptyWorkFilters, type WorkFilterOptions, type WorkFilters } from "./workFilters";

const longNode = "前端代码合入 / 后端代码合入与完整回归验证";
const options: WorkFilterOptions = {
  spaces: [{ value: "space", label: "研发空间" }],
  projects: [{ value: "project", label: "应用平台" }],
  flowKinds: [{ value: "both", label: "节点与状态流" }],
  node: { visible: true, options: [{ value: longNode, label: `${longNode}`, count: 1 }, { value: "测试", label: "测试", count: 1 }] },
  state: { visible: true, options: [{ value: "处理中", label: "处理中", count: 1 }] },
};
let width = 1000;
const observers = new Set<ResizeObserverMock>();
class ResizeObserverMock {
  constructor(readonly callback: ResizeObserverCallback) { observers.add(this); }
  observe() {}
  disconnect() { observers.delete(this); }
}
function resize(next: number) {
  width = next;
  act(() => { for (const observer of [...observers]) observer.callback([], observer as unknown as ResizeObserver); });
}
beforeEach(() => {
  width = 1000;
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { width: this.classList.contains("work-filter-toolbar") ? width : 100,
      height: 32, top: 0, bottom: 32, left: 0, right: width, x: 0, y: 0, toJSON() {} };
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); observers.clear(); });

function Harness({ initial = emptyWorkFilters, filterOptions = options, schemeMenu, hideEmptyNode = false }: {
  initial?: WorkFilters; filterOptions?: WorkFilterOptions; schemeMenu?: ReactNode; hideEmptyNode?: boolean;
}) {
  const [filters, setFilters] = useState(initial);
  const facets = hideEmptyNode ? { ...filterOptions, node: { ...filterOptions.node, visible: filters.nodeName.length > 0 } } : filterOptions;
  return <div onWheel={() => backgroundWheel()}>
    <WorkFilterToolbar filters={filters} options={facets} onChange={setFilters} resultCount={5}
      schemeMenu={schemeMenu || <button type="button" className="filter-scheme-trigger">日常工作</button>} />
    <output aria-label="筛选值">{JSON.stringify(filters)}</output><p>背景清单</p>
  </div>;
}
const backgroundWheel = vi.fn();
function currentFilters(): WorkFilters { return JSON.parse(screen.getByLabelText("筛选值").textContent!); }

it("宽栏使用短节点入口和完整可移除条件，无条件时收起条件行", async () => {
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, nodeName: [longNode] }} />);
  expect(screen.getByRole("combobox", { name: "节点" }).textContent).toBe("节点1");
  const chips = screen.getByRole("group", { name: "当前筛选条件" });
  expect(within(chips).getByRole("button", { name: `移除节点：${longNode}（1）` }).textContent).toContain(longNode);
  expect(screen.getByText("5 条结果")).toBeTruthy();
  await user.click(within(chips).getByRole("button", { name: /移除节点/ }));
  expect(currentFilters().nodeName).toEqual([]);
  expect(screen.queryByRole("group", { name: "当前筛选条件" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "节点" }));
});

it("移除单个多选值保留其他值和类型，清除筛选仍保留当前事项类型", async () => {
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, type: ["story"], typeLabel: { story: "需求" },
    query: "接口", nodeName: [longNode, "测试"], stateName: ["处理中"] }} />);
  await user.click(screen.getByRole("button", { name: `移除节点：${longNode}（1）` }));
  expect(currentFilters()).toMatchObject({ type: ["story"], query: "接口", nodeName: ["测试"], stateName: ["处理中"] });
  await user.click(screen.getByRole("button", { name: "清除筛选" }));
  expect(currentFilters()).toEqual({ ...emptyWorkFilters, type: ["story"], typeLabel: { story: "需求" } });
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
});

it("列表变窄合并全部筛选入口，放宽后恢复控件并保留条件和键盘焦点", async () => {
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, nodeName: [longNode] }} />);
  act(() => screen.getByRole("combobox", { name: "节点" }).focus());
  resize(430);
  const toggle = screen.getByRole("button", { name: "筛选工作" });
  expect(document.activeElement).toBe(toggle);
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("button", { name: `移除节点：${longNode}（1）` })).toBeTruthy();
  await user.click(toggle);
  const panel = screen.getByRole("region", { name: "工作筛选条件" });
  expect(within(panel).getAllByRole("combobox")).toHaveLength(5);
  act(() => within(panel).getByRole("combobox", { name: "当前状态" }).focus());
  resize(1000);
  expect(screen.queryByRole("region", { name: "工作筛选条件" })).toBeNull();
  expect(screen.getAllByRole("combobox")).toHaveLength(5);
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
  expect(currentFilters().nodeName).toEqual([longNode]);
});

it("窄栏支持连续多选和分层 Escape，关闭后返回入口", async () => {
  width = 430;
  const user = userEvent.setup();
  render(<Harness />);
  const toggle = screen.getByRole("button", { name: "筛选工作" });
  await user.click(toggle);
  const node = screen.getByRole("combobox", { name: "节点" });
  await user.click(node);
  await user.click(screen.getByRole("option", { name: `${longNode}（1）` }));
  await user.click(screen.getByRole("option", { name: "测试（1）" }));
  expect(currentFilters().nodeName).toEqual([longNode, "测试"]);
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(screen.getByRole("region", { name: "工作筛选条件" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "工作筛选条件" })).toBeNull();
  expect(document.activeElement).toBe(toggle);
});

it.each([true, false])("筛选字段可见性改变导致布局切换时焦点回到当前入口（原节点可见：%s）", async (nodeVisible) => {
  width = 720;
  const user = userEvent.setup();
  const facets = (visible: boolean) => ({ ...options, node: { ...options.node, visible } });
  const mounted = render(<Harness filterOptions={facets(nodeVisible)} />);
  if (nodeVisible) await user.click(screen.getByRole("button", { name: "筛选工作" }));
  act(() => screen.getByRole("combobox", { name: "流程类型" }).focus());
  mounted.rerender(<Harness filterOptions={facets(!nodeVisible)} />);
  expect(document.activeElement).toBe(nodeVisible
    ? screen.getByRole("combobox", { name: "空间" })
    : screen.getByRole("button", { name: "筛选工作" }));
});

it("窄栏面板与 Portal 选择框隔离连续滚轮，关闭后背景恢复滚动", async () => {
  width = 430;
  backgroundWheel.mockClear();
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "筛选工作" }));
  const panel = screen.getByRole("region", { name: "工作筛选条件" });
  panel.style.overflowY = "auto";
  Object.defineProperties(panel, { clientHeight: { value: 100 }, scrollHeight: { value: 300 } });
  for (const [top, deltaY, blocked] of [[0, -80, true], [0, 80, false], [80, 80, false], [200, 80, true]] as const) {
    panel.scrollTop = top;
    const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
    fireEvent(panel, event);
    expect(event.defaultPrevented).toBe(blocked);
  }
  await user.click(screen.getByRole("combobox", { name: "节点" }));
  const menu = screen.getByRole("listbox");
  for (const deltaY of [80, 80, -80]) expect(fireEvent.wheel(menu, { deltaY })).toBe(false);
  expect(backgroundWheel).not.toHaveBeenCalled();
  await user.keyboard("{Escape}{Escape}");
  expect(fireEvent.wheel(screen.getByText("背景清单"), { deltaY: 80 })).toBe(true);
  expect(backgroundWheel).toHaveBeenCalledOnce();
});

it("移除最后一个节点标签并隐藏字段、展开布局后，将焦点交给存续入口", async () => {
  width = 720;
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, nodeName: [longNode] }} hideEmptyNode />);
  expect(screen.getByRole("button", { name: "筛选工作" })).toBeTruthy();
  await user.click(screen.getByRole("button", { name: `移除节点：${longNode}（1）` }));
  expect(screen.queryByRole("button", { name: "筛选工作" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "节点" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
});

it.each([720, 1000])("从下拉框清空最后一个节点导致字段隐藏后保留焦点（宽度：%s）", async (availableWidth) => {
  width = availableWidth;
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, nodeName: [longNode] }} hideEmptyNode />);
  if (availableWidth === 720) await user.click(screen.getByRole("button", { name: "筛选工作" }));
  await user.click(screen.getByRole("combobox", { name: "节点" }));
  await user.click(screen.getByRole("option", { name: "全部节点" }));
  expect(screen.queryByRole("combobox", { name: "节点" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
});

it("面板底部按钮聚焦时放宽列表，将焦点返回行内入口", async () => {
  width = 430;
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "筛选工作" }));
  act(() => screen.getByRole("button", { name: "收起筛选" }).focus());
  resize(1000);
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
});

it("候选更新移除聚焦字段但不改变布局时，将焦点交给存续入口", () => {
  const mounted = render(<Harness />);
  act(() => screen.getByRole("combobox", { name: "节点" }).focus());
  mounted.rerender(<Harness filterOptions={{ ...options, node: { ...options.node, visible: false } }} />);
  expect(screen.queryByRole("combobox", { name: "节点" })).toBeNull();
  expect(document.activeElement).toBe(screen.getByRole("combobox", { name: "空间" }));
});

it("筛选方案 Portal 对话框消费 Escape 时保留其下已展开的筛选面板", async () => {
  width = 430;
  const controller: FilterSchemesController = {
    document: { schemaVersion: 1, schemes: [], defaultId: null }, current: undefined,
    adjusted: false, busy: false, available: true, error: "",
    retry: vi.fn(), apply: vi.fn(), detach: vi.fn(), save: async () => true, update: async () => true,
    rename: async () => true, remove: async () => true, setDefault: async () => true,
  };
  const user = userEvent.setup();
  render(<Harness schemeMenu={<FilterSchemeMenu controller={controller} onNotice={vi.fn()} />} />);
  await user.click(screen.getByRole("button", { name: "筛选工作" }));
  await user.click(screen.getByRole("button", { name: "筛选方案" }));
  await user.click(screen.getByRole("menuitem", { name: "保存当前条件为新方案" }));
  expect(screen.getByRole("dialog", { name: "保存筛选方案" })).toBeTruthy();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("region", { name: "工作筛选条件" })).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "筛选方案" }));
});

it("移除空间条件沿用既有联动规则清理项目与节点，不清空类型", async () => {
  const user = userEvent.setup();
  render(<Harness initial={{ ...emptyWorkFilters, type: ["story"], space: ["space"], spaceLabel: { space: "研发空间" },
    project: ["project"], projectLabel: { project: "应用平台" }, nodeName: [longNode] }} />);
  await user.click(screen.getByRole("button", { name: "移除空间：研发空间" }));
  expect(currentFilters()).toMatchObject({ type: ["story"], space: [], project: [], nodeName: [] });
});
