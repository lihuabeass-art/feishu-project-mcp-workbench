// @vitest-environment jsdom
import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationLookup } from "./CreationLookup";
import {
  lookupCreationField,
  type CreationField,
  type CreationForm,
  type CreationLookupResult,
} from "./creation";

vi.mock("./creation", () => ({ lookupCreationField: vi.fn() }));

const kinds = [
  { kind: "people", key: "fixer", label: "修复人" },
  { kind: "relation", key: "related", label: "关联事项" },
];
const form: CreationForm = {
  target: { source_id: "source", project_key: "space", type_key: "issue" },
  context: "account",
  version: "version",
  fields: [],
  pending: null,
};
const result = (
  value: string,
  label: string,
  warning: string | null = null,
): CreationLookupResult => ({
  options: [{ value, label }],
  warning,
});
function deferred() {
  let resolve!: (value: CreationLookupResult) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<CreationLookupResult>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}
function field(kind: (typeof kinds)[number]): CreationField {
  return { ...kind, required: false, multiple: true, initial: [], options: [] };
}
function Harness({
  currentField,
  changed,
}: {
  currentField: CreationField;
  changed: ReturnType<typeof vi.fn>;
}) {
  const [value, setValue] = useState<unknown>(["selected"]);
  const [labels, setLabels] = useState({
    [`${currentField.key}:selected`]: "已选项",
  });
  return (
    <CreationLookup
      form={form}
      field={currentField}
      value={value}
      labels={labels}
      change={(next, nextLabels) => {
        setValue(next);
        setLabels((previous) => ({ ...previous, ...nextLabels }));
        changed(next, nextLabels);
      }}
    />
  );
}
async function search(label: string, query: string) {
  fireEvent.change(screen.getByRole("textbox", { name: `搜索${label}` }), {
    target: { value: query },
  });
  await waitFor(() =>
    expect(lookupCreationField).toHaveBeenCalledWith(
      form.target,
      expect.any(String),
      query,
    ),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(lookupCreationField).mockResolvedValue({
    options: [],
    warning: null,
  });
});
afterEach(cleanup);

describe("新建人员与关联候选的查询归属", () => {
  it.each(kinds)(
    "$kind 的新查询失败不会重新启用旧候选，保留已选值且可继续搜索匹配缓存",
    async (kind) => {
      const next = deferred();
      vi.mocked(lookupCreationField).mockImplementation(
        (_target, _key, query) => {
          if (query === "甲") return Promise.resolve(result("a", "甲候选"));
          if (query === "乙") return next.promise;
          if (query === "丙")
            return Promise.resolve(
              result("c", "丙匹配缓存", "在线查询暂不可用，已保留匹配缓存"),
            );
          return Promise.resolve({ options: [], warning: null });
        },
      );
      const changed = vi.fn();
      const user = userEvent.setup();
      render(<Harness currentField={field(kind)} changed={changed} />);
      await user.click(screen.getByRole("combobox", { name: kind.label }));
      await search(kind.label, "甲");
      const previous = await screen.findByRole("option", { name: /甲候选/ });
      await search(kind.label, "乙");
      expect(previous.isConnected).toBe(false);
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(changed).not.toHaveBeenCalled();
      await act(async () => next.reject(new Error("乙查询失败")));
      expect((await screen.findByRole("alert")).textContent).toBe("乙查询失败");
      expect(screen.queryByRole("option")).toBeNull();
      await user.click(previous);
      fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
      expect(changed).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", { name: `从${kind.label}移除已选项` }),
      ).toBeTruthy();
      expect(
        screen.getByRole("textbox").getAttribute("aria-activedescendant"),
      ).toBeNull();

      await search(kind.label, "丙");
      const cached = await screen.findByRole("option", { name: /丙匹配缓存/ });
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByText("在线查询暂不可用，已保留匹配缓存")).toBeTruthy();
      await user.click(cached);
      expect(changed).toHaveBeenLastCalledWith(["selected", "c"], {
        [`${kind.key}:c`]: "丙匹配缓存",
      });
    },
  );

  for (const outcome of ["成功", "失败"]) {
    it.each(kinds)(
      `$kind 忽略上一查询迟到的${outcome}结果，键盘只选择当前候选`,
      async (kind) => {
        const previous = deferred();
        vi.mocked(lookupCreationField).mockImplementation(
          (_target, _key, query) => {
            if (query === "甲") return previous.promise;
            if (query === "乙")
              return Promise.resolve(result("b", "乙候选", "当前查询提示"));
            return Promise.resolve({ options: [], warning: null });
          },
        );
        const changed = vi.fn();
        const user = userEvent.setup();
        render(<Harness currentField={field(kind)} changed={changed} />);
        await user.click(screen.getByRole("combobox", { name: kind.label }));
        await search(kind.label, "甲");
        await search(kind.label, "乙");
        await screen.findByRole("option", { name: /乙候选/ });
        await act(async () => {
          if (outcome === "成功")
            previous.resolve(result("a", "甲候选", "旧查询提示"));
          else previous.reject(new Error("旧查询失败"));
        });
        expect(screen.queryByRole("option", { name: /甲候选/ })).toBeNull();
        expect(screen.queryByText("旧查询提示")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.getByText("当前查询提示")).toBeTruthy();
        fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
        expect(changed).toHaveBeenLastCalledWith(["selected", "b"], {
          [`${kind.key}:b`]: "乙候选",
        });
      },
    );
  }
});
