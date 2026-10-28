// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Select } from "./Select";

afterEach(cleanup);

const options = [
  { value: "", label: "请选择", disabled: true },
  { value: "mint", label: "薄荷绿" },
  { value: "violet", label: "柔光紫" },
  { value: "locked", label: "不可使用", disabled: true },
];

describe("自定义选择框", () => {
  function MultiSelect() {
    const [value, setValue] = useState<string[]>([]);
    return <Select multiple ariaLabel="多选筛选" value={value} onChange={setValue}
      options={[{ value: "", label: "全部" }, ...options.slice(1)]} />;
  }

  it("多选可连续勾选、再次点击取消，全部清空且不关闭菜单", async () => {
    const user = userEvent.setup();
    render(<MultiSelect />);
    const trigger = screen.getByRole("combobox", { name: "多选筛选" });
    await user.click(trigger);
    const menu = screen.getByRole("listbox");
    expect(menu.getAttribute("aria-multiselectable")).toBe("true");
    const mint = screen.getByRole("option", { name: "薄荷绿" });
    const violet = screen.getByRole("option", { name: "柔光紫" });
    await user.click(mint);
    await user.click(violet);
    expect(mint.getAttribute("aria-selected")).toBe("true");
    expect(violet.getAttribute("aria-selected")).toBe("true");
    expect(trigger.textContent).toContain("等 2 项");
    await user.click(mint);
    expect(mint.getAttribute("aria-selected")).toBe("false");
    expect(trigger.textContent).toBe("柔光紫");
    await user.click(screen.getByRole("option", { name: "不可使用" }));
    expect(trigger.textContent).toBe("柔光紫");
    await user.click(screen.getByRole("option", { name: "全部" }));
    expect(trigger.textContent).toBe("全部");
    expect(violet.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByRole("listbox")).toBe(menu);
  });

  it("多选支持键盘切换、空格取消及 Escape 关闭", async () => {
    const user = userEvent.setup();
    render(<MultiSelect />);
    const trigger = screen.getByRole("combobox", { name: "多选筛选" });
    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}{ArrowDown}{Enter}");
    expect(trigger.textContent).toContain("等 2 项");
    await user.keyboard(" ");
    expect(screen.getByRole("option", { name: "柔光紫" }).getAttribute("aria-selected")).toBe("false");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("取消最后一个零计数候选后活动项有效，可继续键盘选择", async () => {
    function DynamicSelect() {
      const [value, setValue] = useState(["gone"]);
      return <Select multiple ariaLabel="动态筛选" value={value} onChange={setValue}
        options={[{ value: "mint", label: "薄荷绿" },
          ...(value.includes("gone") ? [{ value: "gone", label: "旧选项（0）" }] : [])]} />;
    }
    const user = userEvent.setup();
    render(<DynamicSelect />);
    const trigger = screen.getByRole("combobox", { name: "动态筛选" });
    await user.click(trigger);
    await user.keyboard(" ");
    expect(screen.queryByRole("option", { name: "旧选项（0）" })).toBeNull();
    expect(document.getElementById(trigger.getAttribute("aria-activedescendant")!)?.textContent).toBe("薄荷绿");
    await user.keyboard("{Enter}");
    expect(screen.getByRole("option", { name: "薄荷绿" }).getAttribute("aria-selected")).toBe("true");
    expect(trigger.textContent).toBe("薄荷绿");
  });

  it("点击选项后提交值并关闭浮层", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Select
        ariaLabel="主题颜色"
        value=""
        options={options}
        onChange={change}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "主题颜色" }));
    expect(screen.getByRole("listbox", { name: "主题颜色" })).toBeTruthy();
    await user.click(screen.getByRole("option", { name: "柔光紫" }));

    expect(change).toHaveBeenCalledWith("violet");
    expect(screen.queryByRole("listbox", { name: "主题颜色" })).toBeNull();
  });

  it("支持方向键、Enter、Escape，并跳过禁用项", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Select
        ariaLabel="主题颜色"
        value=""
        options={options}
        onChange={change}
      />,
    );
    const trigger = screen.getByRole("combobox", { name: "主题颜色" });

    trigger.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(change).toHaveBeenCalledWith("violet");

    await user.click(trigger);
    await user.keyboard("{End}{ArrowDown}{Enter}");
    expect(change).toHaveBeenLastCalledWith("mint");

    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: "主题颜色" })).toBeNull();
  });

  it("禁用选项不会触发变更", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <Select
        ariaLabel="主题颜色"
        value="mint"
        options={options}
        onChange={change}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "主题颜色" }));
    await user.click(screen.getByRole("option", { name: "不可使用" }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole("listbox", { name: "主题颜色" })).toBeTruthy();
  });
});
