// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreationSelect, type CreationSelectProps } from "./CreationSelect";
import {
  matchesLocalCreationDefault,
  type LocalCreationDefaults,
} from "./CreationSettings";
import type { CreationField } from "./creation";

const field = (patch: Partial<CreationField> = {}): CreationField => ({
  key: "priority",
  label: "优先级",
  kind: "select",
  multiple: false,
  required: true,
  initial: null,
  options: [
    { value: "high-id", label: "紧急", color: "#d95154" },
    { value: "normal-id", label: "普通" },
    { value: "low-id", label: "较低", color: "blue" },
  ],
  ...patch,
});

function Harness({
  initial = "high-id",
  initialDefault,
  changedDefault = vi.fn(),
  ...rest
}: Partial<CreationSelectProps> & {
  initial?: unknown;
  initialDefault?: LocalCreationDefaults[string];
  changedDefault?: (value: LocalCreationDefaults[string] | undefined) => void;
}) {
  const currentField = rest.field || field();
  const [value, setValue] = useState<unknown>(initial);
  const [saved, setSaved] = useState(initialDefault);
  return (
    <CreationSelect
      {...rest}
      field={currentField}
      value={value}
      onChange={setValue}
      savedDefault={saved}
      onToggleDefault={() => {
        const next = matchesLocalCreationDefault(currentField, value, saved)
          ? undefined
          : { kind: currentField.kind, multiple: currentField.multiple, value };
        setSaved(next);
        changedDefault(next);
      }}
    />
  );
}

afterEach(cleanup);

describe("新建表单的彩色下拉框与默认星标", () => {
  it("星标与已选文字同处闭合框，按钮独立且点击或键盘切换不会展开下拉", async () => {
    const user = userEvent.setup();
    const changedDefault = vi.fn();
    render(<Harness changedDefault={changedDefault} />);
    const trigger = screen.getByRole("combobox", { name: "优先级" });
    const content = document.querySelector(
      ".creation-select-content",
    ) as HTMLElement;
    expect(within(content).getByText("紧急")).toBeTruthy();
    const star = within(content).getByRole("button", {
      name: "将优先级设为本地默认值",
    });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(star.querySelector("svg")?.getAttribute("fill")).toBe("none");
    expect(trigger.contains(star)).toBe(false);
    expect(document.querySelector("button button")).toBeNull();
    await user.click(star);
    expect(star.getAttribute("aria-pressed")).toBe("true");
    expect(star.querySelector("svg")?.getAttribute("fill")).toBe(
      "currentColor",
    );
    expect(star.getAttribute("title")).toBe("取消本地默认值");
    expect(changedDefault).toHaveBeenLastCalledWith({
      kind: "select",
      multiple: false,
      value: "high-id",
    });
    expect(screen.queryByRole("listbox")).toBeNull();
    star.focus();
    await user.keyboard(" ");
    expect(star.getAttribute("aria-pressed")).toBe("false");
    expect(changedDefault).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("切换选项后星标为空，点击替换旧默认，再次点击清除当前默认", async () => {
    const user = userEvent.setup();
    const changedDefault = vi.fn();
    render(
      <Harness
        initialDefault={{ kind: "select", multiple: false, value: "high-id" }}
        changedDefault={changedDefault}
      />,
    );
    expect(
      screen
        .getByRole("button", { name: "清除优先级的本地默认值" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    await user.click(screen.getByRole("combobox", { name: "优先级" }));
    const normal = screen.getByRole("option", { name: "普通" });
    expect(normal.querySelector(".creation-option-chip")).toBeTruthy();
    await user.click(normal);
    const star = screen.getByRole("button", { name: "将优先级设为本地默认值" });
    expect(star.getAttribute("aria-pressed")).toBe("false");
    await user.click(star);
    expect(changedDefault).toHaveBeenLastCalledWith({
      kind: "select",
      multiple: false,
      value: "normal-id",
    });
    expect(star.getAttribute("aria-pressed")).toBe("true");
    await user.click(star);
    expect(changedDefault).toHaveBeenLastCalledWith(undefined);
  });

  it("菜单展开时点星标会收起候选，不把焦点留在展开菜单之外", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("combobox", { name: "优先级" });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();
    const star = screen.getByRole("button", { name: "将优先级设为本地默认值" });
    await user.click(star);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(star.getAttribute("aria-pressed")).toBe("true");
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(trigger);
    await user.keyboard("{ArrowDown}{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("选项颜色优先，缺省颜色随稳定 ID 保持一致，不依赖中文名称和排列", async () => {
    const user = userEvent.setup();
    const initial = field();
    const props = {
      field: initial,
      value: "normal-id",
      onChange: vi.fn(),
      onToggleDefault: vi.fn(),
    };
    const mounted = render(<CreationSelect {...props} />);
    const selected = document.querySelector(
      ".creation-select-content .creation-option-chip",
    ) as HTMLElement;
    const stableColor = selected.style.getPropertyValue(
      "--creation-chip-color",
    );
    expect(stableColor).toMatch(/^#[a-f\d]{6}$/i);
    await user.click(screen.getByRole("combobox", { name: "优先级" }));
    expect(
      (
        screen
          .getByRole("option", { name: "紧急" })
          .querySelector(".creation-option-chip") as HTMLElement
      ).style.getPropertyValue("--creation-chip-color"),
    ).toBe("#d95154");
    expect(
      (
        screen
          .getByRole("option", { name: "普通" })
          .querySelector(".creation-option-chip") as HTMLElement
      ).style.getPropertyValue("--creation-chip-color"),
    ).toBe(stableColor);
    expect(
      (
        screen
          .getByRole("option", { name: "较低" })
          .querySelector(".creation-option-chip") as HTMLElement
      ).style.getPropertyValue("--creation-chip-color"),
    ).toBe("#3370ff");
    await user.keyboard("{Escape}");
    mounted.rerender(
      <CreationSelect
        {...props}
        field={field({
          options: [
            initial.options[2],
            { value: "normal-id", label: "改过的中文名称" },
            initial.options[0],
          ],
        })}
      />,
    );
    const renamed = document.querySelector(
      ".creation-select-content .creation-option-chip",
    ) as HTMLElement;
    expect(renamed.textContent).toBe("改过的中文名称");
    expect(renamed.style.getPropertyValue("--creation-chip-color")).toBe(
      stableColor,
    );
  });

  it("多选逐项显示 chip，方向键和连续勾选可用，默认值比较不受选择顺序影响", async () => {
    const user = userEvent.setup();
    render(
      <Harness
        field={field({ multiple: true })}
        initial={["normal-id", "high-id"]}
        initialDefault={{
          kind: "select",
          multiple: true,
          value: ["high-id", "normal-id"],
        }}
      />,
    );
    const chips = document.querySelectorAll(
      ".creation-select-content .creation-option-chip",
    );
    expect([...chips].map((chip) => chip.textContent)).toEqual([
      "普通",
      "紧急",
    ]);
    expect(
      screen
        .getByRole("button", { name: "清除优先级的本地默认值" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    const trigger = screen.getByRole("combobox", { name: "优先级" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{End}{Enter}");
    expect(
      screen.getByRole("listbox").getAttribute("aria-multiselectable"),
    ).toBe("true");
    expect(
      screen
        .getByRole("option", { name: "较低" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "将优先级设为本地默认值" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    await user.click(screen.getByRole("option", { name: "待填" }));
    await user.keyboard("{Escape}");
    expect(
      (
        screen.getByRole("button", {
          name: "将优先级设为本地默认值",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("未选、已失效和禁用状态不能保存默认，保存尚未确认时不会提前点亮星标", async () => {
    const user = userEvent.setup();
    const toggle = vi.fn();
    const props = {
      field: field(),
      onChange: vi.fn(),
      onToggleDefault: toggle,
    };
    const mounted = render(<CreationSelect {...props} value="" />);
    const star = screen.getByRole("button", { name: "将优先级设为本地默认值" });
    expect((star as HTMLButtonElement).disabled).toBe(true);
    await user.click(star);
    expect(toggle).not.toHaveBeenCalled();
    mounted.rerender(<CreationSelect {...props} value="removed-id" />);
    expect((star as HTMLButtonElement).disabled).toBe(true);
    mounted.rerender(<CreationSelect {...props} value="high-id" disabled />);
    expect((star as HTMLButtonElement).disabled).toBe(true);
    expect(
      (screen.getByRole("combobox", { name: "优先级" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    mounted.rerender(<CreationSelect {...props} value="high-id" />);
    await user.click(star);
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(star.getAttribute("aria-pressed")).toBe("false");
  });
});
