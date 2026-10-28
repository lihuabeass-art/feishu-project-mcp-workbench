// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ComponentProps } from "react";
import { SourceTypes } from "./SourceTypes";
import type { Source } from "./types";

afterEach(cleanup);
const source: Source = {
  id: "my-todos",
  kind: "personal_todo",
  enabled: true,
  executable: true,
  reason: null,
  action: "todo",
  todo_scope: null,
  type_scope: {
    configured: false,
    selected_count: 0,
    types: [
      {
        project_key: "a",
        project_name: "空间甲",
        type_key: "story",
        type_name: "需求",
        selected: true,
      },
      {
        project_key: "b",
        project_name: "空间乙",
        type_key: "story",
        type_name: "需求",
        selected: true,
      },
      {
        project_key: "a",
        project_name: "空间甲",
        type_key: "custom-key",
        type_name: "新业务类型",
        selected: true,
      },
    ],
  },
};
const typeName = (key: string) =>
  source.type_scope!.types.find((t) => t.type_key === key)?.type_name || key;
const label = (key: string) => (key === "story" ? "我的研发" : typeName(key));
const display = {
  typeName,
  typeKeys: [],
  preferences: { story: { enabled: true, alias: "我的研发" } },
  updatePreferences: vi.fn(),
  saveTypeOrder: vi.fn(),
};

function renderTypes(
  overrides: Partial<ComponentProps<typeof SourceTypes>> = {},
) {
  const props = {
    ...display,
    source,
    disabled: false,
    label,
    apply: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  function Harness() {
    const [current, setCurrent] = useState(props.source);
    return (
      <SourceTypes
        {...props}
        source={current}
        apply={async (action, keys) => {
          const success = await props.apply(action, keys);
          if (success && action === "save" && current?.type_scope) {
            setCurrent({
              ...current,
              type_scope: {
                ...current.type_scope,
                configured: keys !== null,
                types: current.type_scope.types.map((t) => ({
                  ...t,
                  selected: keys === null || !!keys?.includes(t.type_key),
                })),
              },
            });
          }
          return success;
        }}
      />
    );
  }
  return render(<Harness />);
}

describe("同步类型开关", () => {
  it("标明来源名称和空间，未发现类型时不展示缓存类型或其配置", () => {
    renderTypes({
      source: {
        ...source,
        type_scope: { configured: false, selected_count: 0, types: [] },
      },
      sourceLabel: "我参与的需求 · 空间甲",
      typeKeys: ["story", "cached-only"],
    });
    expect(screen.getByText("当前来源：我参与的需求 · 空间甲")).toBeTruthy();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText(/当前来源尚未发现工作类型/)).toBeTruthy();
  });

  it("自定义名称输入时自动保存，保留输入中的空格且清空立即恢复原名", async () => {
    const user = userEvent.setup();
    const updatePreferences = vi.fn();
    const apply = vi.fn().mockResolvedValue(true);
    renderTypes({ updatePreferences, apply });
    const input = screen.getByRole("textbox", { name: "新业务类型的显示别名" });
    await user.type(input, "  Product Design  ");
    expect((input as HTMLInputElement).value).toBe("  Product Design  ");
    expect(document.activeElement).toBe(input);
    expect(updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        "custom-key": { enabled: true, alias: "Product Design" },
      }),
    );
    expect(screen.queryByRole("button", { name: /^保存$/ })).toBeNull();
    await user.clear(input);
    expect(updatePreferences).toHaveBeenLastCalledWith(
      expect.objectContaining({
        "custom-key": { enabled: true, alias: "" },
      }),
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it("移除模式与保存步骤，显示偏好独立，缓存类型不会混入同步选择", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(true);
    const updatePreferences = vi.fn();
    renderTypes({ typeKeys: ["cached-only"], updatePreferences, apply });
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "保存同步范围" })).toBeNull();
    expect(screen.getByLabelText("新业务类型的显示别名")).toBeTruthy();
    expect(
      (
        screen.getByRole("switch", {
          name: "同步新业务类型",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.click(
      screen.getByRole("switch", { name: "新业务类型在清单中显示" }),
    );
    expect(updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        "custom-key": { enabled: false, alias: "" },
      }),
    );
    expect(apply).not.toHaveBeenCalled();
    expect(screen.queryByRole("listitem", { name: "cached-only" })).toBeNull();
    expect(screen.queryByText("未在所选来源发现")).toBeNull();
    await user.click(screen.getByRole("switch", { name: "同步新业务类型" }));
    expect(apply).toHaveBeenCalledWith("save", ["story"]);
  });

  it("类型发现包含无事项的新类型，别名和跨空间分组不改变保存的原始key", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(true);
    renderTypes({ apply });
    expect(screen.getAllByRole("switch", { name: /^同步/ })).toHaveLength(2);
    await user.click(screen.getByRole("switch", { name: "同步我的研发" }));
    expect(apply).toHaveBeenCalledWith("save", ["custom-key"]);
    expect(screen.getByText("1 / 2 种类型参与同步")).toBeTruthy();
    expect(screen.getByText(/新发现的类型默认开启/)).toBeTruthy();
  });

  it("关闭全部保存为空数组，重新全部开启显示完整范围", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(true);
    renderTypes({ apply });
    for (const checkbox of screen.getAllByRole("switch", { name: /^同步/ }))
      await user.click(checkbox);
    expect(screen.getByText(/当前已发现的类型均已关闭/)).toBeTruthy();
    expect(apply).toHaveBeenLastCalledWith("save", []);
    for (const checkbox of screen.getAllByRole("switch", { name: /^同步/ }))
      await user.click(checkbox);
    expect(apply).toHaveBeenLastCalledWith("save", ["story", "custom-key"]);
    expect(screen.getByText("2 / 2 种类型参与同步")).toBeTruthy();
  });

  it("已保存空集正确回显，恢复全部走独立清除语义", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(true);
    const empty = {
      ...source,
      type_scope: {
        configured: true,
        selected_count: 0,
        types: source.type_scope!.types.map((t) => ({ ...t, selected: false })),
      },
    };
    renderTypes({ source: empty, apply });
    expect(
      screen
        .getAllByRole("switch", { name: /^同步/ })
        .every((c) => !(c as HTMLInputElement).checked),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "恢复全部同步" }));
    expect(apply).toHaveBeenCalledWith("save", null);
    expect(screen.getByText(/新发现的类型默认开启/)).toBeTruthy();
    expect(
      screen
        .getAllByRole("switch", { name: /^同步/ })
        .every((c) => (c as HTMLInputElement).checked),
    ).toBe(true);
  });

  it("保存失败保持原状态并可重试，发现类型不会提交范围", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(false);
    renderTypes({ apply });
    await user.click(screen.getByRole("switch", { name: "同步我的研发" }));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(
      (
        screen.getByRole("switch", {
          name: "同步我的研发",
        }) as HTMLInputElement
      ).checked,
    ).toBe(true);
    await user.click(screen.getByRole("switch", { name: "同步我的研发" }));
    expect(apply).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "发现类型" }));
    expect(apply).toHaveBeenLastCalledWith("refresh", undefined);
  });

  it("保存期间阻止并发同步更改，显示偏好仍可使用", async () => {
    const user = userEvent.setup();
    let finish!: (value: boolean) => void;
    const apply = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          finish = resolve;
        }),
    );
    const updatePreferences = vi.fn();
    renderTypes({ apply, updatePreferences });
    await user.click(screen.getByRole("switch", { name: "同步我的研发" }));
    expect(
      screen
        .getAllByRole("switch", { name: /^同步/ })
        .every((c) => (c as HTMLInputElement).disabled),
    ).toBe(true);
    await user.click(screen.getByRole("switch", { name: "同步新业务类型" }));
    expect(apply).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("switch", { name: "新业务类型在清单中显示" }),
    );
    expect(updatePreferences).toHaveBeenCalledTimes(1);
    finish(true);
    await waitFor(() =>
      expect(
        (
          screen.getByRole("switch", {
            name: "同步新业务类型",
          }) as HTMLInputElement
        ).disabled,
      ).toBe(false),
    );
  });

  it("离线时保留已发现类型的本机偏好，缺少来源类型清单时不展示缓存类型", () => {
    const view = renderTypes({ disabled: true });
    expect(
      (screen.getByRole("switch", { name: "同步我的研发" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("switch", {
          name: "我的研发在清单中显示",
        }) as HTMLInputElement
      ).disabled,
    ).toBe(false);
    view.unmount();
    renderTypes({
      source: { ...source, type_scope: undefined },
      typeKeys: ["story"],
    });
    expect(screen.queryByRole("switch", { name: /^同步/ })).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByText("当前服务未提供来源类型清单，暂时无法配置工作类型。"),
    ).toBeTruthy();
  });
});
