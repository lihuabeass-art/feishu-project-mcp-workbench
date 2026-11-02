// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreationFieldVisibility } from "./CreationFieldVisibility";
import { useScrollIsolation } from "./useScrollIsolation";
import type { CreationForm } from "./creation";

afterEach(cleanup);

const form: CreationForm = {
  context: "account", version: "remote-config", pending: null,
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  fields: Array.from({ length: 24 }, (_, index) => ({
    key: `person-${index}`, label: `人员角色 ${index}`, kind: "people",
    required: false, multiple: true, initial: null, options: [],
  })),
};

function Drawer({ outerWheel }: { outerWheel: () => void }) {
  const backdropRef = useScrollIsolation();
  return <div onWheel={outerWheel}>
    <div className="creation-backdrop scroll-isolation-boundary" ref={backdropRef}>
      <div className="creation-content" style={{ overflowY: "auto" }}>
        <CreationFieldVisibility form={form} selected={[]} values={{}} disabled={false} onChange={vi.fn()} />
      </div>
    </div>
  </div>;
}

it("字段卡片、搜索和空结果共用抽屉正文滚动，正文边界不带动背景", async () => {
  const user = userEvent.setup();
  const outerWheel = vi.fn();
  const { container } = render(<Drawer outerWheel={outerWheel} />);
  const content = container.querySelector<HTMLElement>(".creation-content")!;
  Object.defineProperties(content, {
    clientHeight: { value: 200 }, scrollHeight: { value: 1000 },
  });
  const trigger = screen.getByRole("button", { name: /显示字段/ });
  await user.click(trigger);
  const card = screen.getByRole("button", { name: "显示人员角色 0" });
  content.scrollTop = 100;
  expect(fireEvent.wheel(card, { deltaY: 50 })).toBe(true);
  expect(fireEvent.wheel(card, { deltaY: -50 })).toBe(true);
  for (const area of [screen.getByRole("textbox", { name: "搜索可选字段" }), screen.getByText("本机保存 · 升级保留")])
    expect(fireEvent.wheel(area, { deltaY: 50 })).toBe(true);
  await user.type(screen.getByRole("textbox", { name: "搜索可选字段" }), "没有此字段");
  expect(fireEvent.wheel(screen.getByRole("status"), { deltaY: 50 })).toBe(true);
  content.scrollTop = 0;
  expect(fireEvent.wheel(screen.getByRole("status"), { deltaY: -50 })).toBe(false);
  content.scrollTop = 800;
  for (let index = 0; index < 3; index += 1)
    expect(fireEvent.wheel(screen.getByRole("status"), { deltaY: 50 })).toBe(false);
  expect(outerWheel).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "清空字段搜索" }));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "搜索可选字段" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "表单字段配置" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  content.scrollTop = 100;
  expect(fireEvent.wheel(trigger, { deltaY: 50 })).toBe(true);
  expect(outerWheel).not.toHaveBeenCalled();
});

it.each([
  { label: "能放下时只补足底部被遮住的距离", top: 350, height: 260, expected: 222 },
  { label: "过长时让入口和搜索从正文顶部开始", top: 350, height: 800, expected: 338 },
  { label: "完整可见时保持当前位置", top: 160, height: 260, expected: 100 },
])("展开字段配置：$label，搜索和选择不重复定位", async ({ top, height, expected }) => {
  const user = userEvent.setup();
  const { container } = render(<Drawer outerWheel={vi.fn()} />);
  const content = container.querySelector<HTMLElement>(".creation-content")!;
  const config = container.querySelector<HTMLElement>(".creation-field-visibility")!;
  Object.defineProperty(content, "clientHeight", { value: 400 });
  content.getBoundingClientRect = () => ({ top: 100 } as DOMRect);
  config.getBoundingClientRect = () => ({ top, bottom: top + height, height } as DOMRect);
  content.scrollTop = 100;
  await user.click(screen.getByRole("button", { name: /显示字段/ }));
  expect(content.scrollTop).toBe(expected);
  await user.click(screen.getByRole("button", { name: "显示人员角色 0" }));
  await user.type(screen.getByRole("textbox", { name: "搜索可选字段" }), "人员");
  await user.click(screen.getByRole("button", { name: "人员信息" }));
  expect(content.scrollTop).toBe(expected);
});

it("配置可用键盘点选，已有草稿和远端初始人员的显示不依赖配置", async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<CreationFieldVisibility form={form} selected={[]} values={{ "person-0": ["self"], "person-1": ["saved"] }}
    disabled={false} onChange={onChange} />);
  await user.click(screen.getByRole("button", { name: /显示字段/ }));
  expect(screen.getByRole("button", { name: "隐藏人员角色 0" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "隐藏人员角色 1" })).toHaveProperty("disabled", true);
  screen.getByRole("button", { name: "显示人员角色 2" }).focus();
  await user.keyboard("{Enter}");
  expect(onChange).toHaveBeenCalledWith(["person-2"]);
});
