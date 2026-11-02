// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreationFieldVisibility } from "./CreationFieldVisibility";
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

it("字段配置长列表内部滚动，搜索、空列表与边界连续滚轮不带动表单，关闭后恢复", async () => {
  const user = userEvent.setup();
  const outerWheel = vi.fn();
  render(<div onWheel={outerWheel}>
    <CreationFieldVisibility form={form} selected={[]} values={{}} disabled={false} onChange={vi.fn()} />
  </div>);
  const trigger = screen.getByRole("button", { name: /显示字段/ });
  await user.click(trigger);
  const cards = screen.getByRole("group", { name: "可选字段" });
  cards.style.overflowY = "auto";
  let scrollHeight = 600;
  Object.defineProperties(cards, {
    clientHeight: { value: 200 }, scrollHeight: { get: () => scrollHeight },
  });
  const card = screen.getByRole("button", { name: "显示人员角色 0" });
  cards.scrollTop = 100;
  expect(fireEvent.wheel(card, { deltaY: 50 })).toBe(true);
  expect(fireEvent.wheel(card, { deltaY: -50 })).toBe(true);
  cards.scrollTop = 0;
  expect(fireEvent.wheel(card, { deltaY: -50 })).toBe(false);
  cards.scrollTop = 400;
  for (let index = 0; index < 3; index += 1)
    expect(fireEvent.wheel(card, { deltaY: 50 })).toBe(false);
  scrollHeight = 200;
  cards.scrollTop = 0;
  expect(fireEvent.wheel(card, { deltaY: 50 })).toBe(false);
  for (const area of [screen.getByRole("textbox", { name: "搜索可选字段" }), screen.getByText("本机保存 · 升级保留")])
    expect(fireEvent.wheel(area, { deltaY: 50 })).toBe(false);
  await user.type(screen.getByRole("textbox", { name: "搜索可选字段" }), "没有此字段");
  expect(fireEvent.wheel(screen.getByRole("status"), { deltaY: 50 })).toBe(false);
  expect(outerWheel).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "清空字段搜索" }));
  expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "搜索可选字段" }));
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("region", { name: "表单字段配置" })).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(fireEvent.wheel(trigger, { deltaY: 50 })).toBe(true);
  expect(outerWheel).toHaveBeenCalledTimes(1);
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
