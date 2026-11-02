// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("滚轮保留菜单内部滚动，边界与短列表不穿透，关闭后恢复外部滚动", async () => {
    const user = userEvent.setup();
    const backgroundWheel = vi.fn();
    const change = vi.fn();
    const mounted = render(
      <div onWheel={backgroundWheel}>
        <Select ariaLabel="滚动筛选" value="" options={options} onChange={change} />
        <p>背景清单</p>
      </div>,
    );
    const trigger = screen.getByRole("combobox", { name: "滚动筛选" });
    await user.click(trigger);
    const menu = screen.getByRole("listbox");
    menu.style.overflowY = "auto";
    let height = 300;
    Object.defineProperties(menu, {
      clientHeight: { value: 100 },
      scrollHeight: { get: () => height },
    });
    for (const [top, deltaY, blocked] of [
      [0, -80, true], [0, 80, false], [80, 80, false],
      [80, -80, false], [200, 80, true], [200, -80, false],
    ] as const) {
      menu.scrollTop = top;
      const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY });
      fireEvent(screen.getByRole("option", { name: "薄荷绿" }), event);
      expect(event.defaultPrevented).toBe(blocked);
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
    }
    height = 100;
    menu.scrollTop = 0;
    for (const deltaY of [-80, 80, 80]) {
      expect(fireEvent.wheel(menu, { deltaY })).toBe(false);
    }
    expect(fireEvent.wheel(menu, { deltaX: 80 })).toBe(false);
    expect(fireEvent.wheel(menu, { deltaY: 80, ctrlKey: true })).toBe(true);
    expect(backgroundWheel).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
    expect(fireEvent.wheel(screen.getByText("背景清单"), { deltaY: 80 })).toBe(true);
    expect(backgroundWheel).toHaveBeenCalledTimes(1);
    mounted.unmount();
    // 卸载后的节点不再保留会取消默认滚动的监听。
    expect(fireEvent.wheel(menu, { deltaY: 80 })).toBe(true);
  });

  function MultiSelect() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <Select
        multiple
        ariaLabel="多选筛选"
        value={value}
        onChange={setValue}
        options={[{ value: "", label: "全部" }, ...options.slice(1)]}
      />
    );
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
    expect(
      screen
        .getByRole("option", { name: "柔光紫" })
        .getAttribute("aria-selected"),
    ).toBe("false");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("取消最后一个零计数候选后活动项有效，可继续键盘选择", async () => {
    function DynamicSelect() {
      const [value, setValue] = useState(["gone"]);
      return (
        <Select
          multiple
          ariaLabel="动态筛选"
          value={value}
          onChange={setValue}
          options={[
            { value: "mint", label: "薄荷绿" },
            ...(value.includes("gone")
              ? [{ value: "gone", label: "旧选项（0）" }]
              : []),
          ]}
        />
      );
    }
    const user = userEvent.setup();
    render(<DynamicSelect />);
    const trigger = screen.getByRole("combobox", { name: "动态筛选" });
    await user.click(trigger);
    await user.keyboard(" ");
    expect(screen.queryByRole("option", { name: "旧选项（0）" })).toBeNull();
    expect(
      document.getElementById(trigger.getAttribute("aria-activedescendant")!)
        ?.textContent,
    ).toBe("薄荷绿");
    await user.keyboard("{Enter}");
    expect(
      screen
        .getByRole("option", { name: "薄荷绿" })
        .getAttribute("aria-selected"),
    ).toBe("true");
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

  it("多选内容换行改变控件高度后，菜单继续锚定当前控件底部", async () => {
    const user = userEvent.setup();
    const props = {
      multiple: true as const,
      ariaLabel: "换行选项",
      options,
      onChange: vi.fn(),
    };
    const mounted = render(<Select {...props} value={["mint"]} />);
    const trigger = screen.getByRole("combobox", { name: "换行选项" });
    let bottom = 40;
    vi.spyOn(trigger, "getBoundingClientRect").mockImplementation(() => ({
      left: 20,
      right: 260,
      top: 0,
      bottom,
      width: 240,
      height: bottom,
      x: 20,
      y: 0,
      toJSON: () => ({}),
    }));
    await user.click(trigger);
    const menu = screen.getByRole("listbox", { name: "换行选项" });
    expect(menu.style.top).toBe("48px");
    bottom = 76;
    mounted.rerender(<Select {...props} value={["mint", "violet"]} />);
    await waitFor(() => expect(menu.style.top).toBe("84px"));
  });
});
