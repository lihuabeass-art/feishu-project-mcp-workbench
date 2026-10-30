// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { SourceTypes } from "./SourceTypes";
import type { Source } from "./types";

afterEach(cleanup);
const source: Source = {
  id: "my-todos", kind: "personal_todo", enabled: true, executable: true,
  reason: null, action: "todo", todo_scope: null,
  type_scope: {
    configured: true, selected_count: 0,
    types: [
      { project_key: "a", project_name: "空间甲", type_key: "story", type_name: "需求", selected: false },
      { project_key: "b", project_name: "空间乙", type_key: "story", type_name: "需求", selected: false },
      { project_key: "a", project_name: "空间甲", type_key: "custom-key", type_name: "新业务类型", selected: false },
    ],
  },
};
const typeName = (key: string) => source.type_scope!.types.find((t) => t.type_key === key)?.type_name || key;
const label = (key: string) => key === "story" ? "我的研发" : typeName(key);
function renderTypes(overrides: Partial<ComponentProps<typeof SourceTypes>> = {}) {
  return render(<SourceTypes source={source} disabled={false} label={label} typeName={typeName}
    typeKeys={[]} preferences={{ story: { enabled: true, alias: "我的研发" } }}
    updatePreferences={vi.fn()} saveTypeOrder={vi.fn()} apply={vi.fn().mockResolvedValue(true)} {...overrides} />);
}

describe("工作类型显示设置", () => {
  it("旧配置与新发现类型的新建默认关闭，开启独立保存且保留清单显示和别名", async () => {
    const user = userEvent.setup(); const updatePreferences = vi.fn();
    renderTypes({ updatePreferences });
    expect((screen.getByRole("switch", { name: "允许新建我的研发" }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole("switch", { name: "允许新建新业务类型" }) as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByRole("switch", { name: "允许新建我的研发" }));
    expect(updatePreferences).toHaveBeenLastCalledWith({ story: { enabled: true, alias: "我的研发", create_enabled: true } });
  });
  it("移除同步开关、同步计数与恢复入口，旧排除配置不隐藏可配置类型", async () => {
    const user = userEvent.setup(); const apply = vi.fn().mockResolvedValue(true);
    renderTypes({ apply, typeKeys: ["cached-only"] });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("switch", { name: /^同步/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "恢复全部同步" })).toBeNull();
    expect(screen.queryByText(/\d.*种类型参与同步/)).toBeNull();
    expect(screen.getByText(/所有工作类型均参与同步/)).toBeTruthy();
    expect(screen.queryByRole("listitem", { name: "cached-only" })).toBeNull();
    expect(screen.getByText("空间甲、空间乙")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "发现类型" }));
    expect(apply).toHaveBeenCalledExactlyOnceWith("refresh");
  });

  it("清单显示独立保存，不调用类型发现或同步范围接口", async () => {
    const user = userEvent.setup(); const updatePreferences = vi.fn(); const apply = vi.fn();
    renderTypes({ updatePreferences, apply });
    await user.click(screen.getByRole("switch", { name: "新业务类型在清单中显示" }));
    expect(updatePreferences).toHaveBeenCalledWith(expect.objectContaining({ "custom-key": { enabled: false, alias: "" } }));
    expect(apply).not.toHaveBeenCalled();
  });

  it("自定义名称自动保存，保留输入空格并允许清空", async () => {
    const user = userEvent.setup(); const updatePreferences = vi.fn();
    renderTypes({ updatePreferences });
    const input = screen.getByRole("textbox", { name: "新业务类型的显示别名" });
    await user.type(input, "  Product Design  ");
    expect((input as HTMLInputElement).value).toBe("  Product Design  ");
    expect(document.activeElement).toBe(input);
    expect(updatePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ "custom-key": { enabled: true, alias: "Product Design" } }));
    await user.clear(input);
    expect(updatePreferences).toHaveBeenLastCalledWith(expect.objectContaining({ "custom-key": { enabled: true, alias: "" } }));
  });

  it("离线保留显示偏好，发现按钮禁用；未发现类型时不混入缓存类型", () => {
    const view = renderTypes({ disabled: true });
    expect((screen.getByRole("button", { name: "发现类型" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("switch", { name: "我的研发在清单中显示" }) as HTMLInputElement).disabled).toBe(false);
    view.unmount();
    renderTypes({ source: { ...source, type_scope: undefined }, typeKeys: ["story"] });
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("当前服务未提供来源类型清单，暂时无法配置工作类型。")).toBeTruthy();
  });
});
