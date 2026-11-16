// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { diagnosticText, reportFailure, SyncDiagnostics } from "./SyncDiagnostics";
import { readFailureMessage, syncFailureMessage } from "./readFeedback";
import type { SyncReport, SyncRun } from "./types";

afterEach(cleanup);
const failedRun: SyncRun = {
  id: 7, started_at_ms: 1700000000000, finished_at_ms: 1700000001000,
  action: "personal_todo", todo_scope: "in_progress", status: "failed",
  pages_fetched: 0, items_received: 0, items_upserted: 0, items_rejected: 0,
  remote_total: null, stop_reason: "error", error_kind: "parse",
  error_message: "个人待办：缺少 list 数组", rejection_detail: null,
  source_id: "personal-todo", trigger: "manual",
};
const report: SyncReport = {
  run_id: 7, status: "failed", complete: false, items_upserted: 0,
  items_inserted: 0, items_updated: 0, items_rejected: 0, stop_reason: "error",
};

describe("同步错误原因与诊断", () => {
  it("解析和参数校验错误有明确提示，空间相关提示仅依据明确失败文字", () => {
    expect(readFailureMessage("parse")).toContain("内容无法完整解析");
    expect(readFailureMessage("validation")).toContain("读取参数未通过校验");
    for (const message of ["missing project_key", "project_key is invalid", "缺少空间标识"]) {
      expect(syncFailureMessage("tool", message)).toContain("空间上下文未能确认");
    }
    expect(syncFailureMessage("tool", "请传入 asset_key")).toContain("待办查询标识缺失或无效");
    for (const message of ["project_key=p; invalid work_item_id", "missing work_item_id for project_key=p",
      "project_key missing_suffix", "missing project_key_extra", "valid project_key, invalid work_item_id"]) {
      expect(syncFailureMessage("tool", message)).not.toContain("空间上下文");
    }
    expect(syncFailureMessage("tool", "project_key=p; service unavailable")).not.toContain("空间上下文");
    expect(syncFailureMessage("permission", "invalid project_key")).toContain("没有读取权限");
    expect(syncFailureMessage("auth", "missing project_key")).toContain("凭证已失效");
    expect(readFailureMessage("parse")).not.toContain("同步诊断");
  });

  it("失败报告只关联同一次运行的错误，不借用其他来源历史记录", () => {
    expect(reportFailure(report, [failedRun])).toEqual({ kind: "parse", message: failedRun.error_message });
    expect(reportFailure({ ...report, run_id: 8 }, [failedRun])).toEqual({ kind: "incomplete", message: "同步中断" });
    expect(reportFailure({ ...report, run_id: undefined }, [failedRun]).message).not.toContain("list 数组");
  });

  it("拒绝记录保留具体原因", () => {
    expect(reportFailure({ ...report, items_rejected: 1 }, [{ ...failedRun, error_kind: null,
      error_message: null, rejection_detail: '[{"code":"missing_identity","count":1}]' }]))
      .toEqual({ kind: "parse", message: '[{"code":"missing_identity","count":1}]' });
  });

  it("可展开历史详情并复制诊断，常见凭证格式在两条路径均隐藏", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const error = { kind: "tool", message: 'missing asset_key; X-Mcp-Token: header-secret; {"token":"json-secret"}; Bearer bearer-secret' };
    render(<SyncDiagnostics sources={[]} failures={[["personal-todo", error]]}
      runs={[failedRun]} close={() => {}} />);
    fireEvent.click(screen.getByText(/personal-todo.*本次会话失败/));
    expect(screen.getByText(/missing asset_key/).textContent).not.toMatch(/header-secret|json-secret|bearer-secret/);
    fireEvent.click(screen.getByText(/personal-todo.* · 失败$/, { selector: "summary" }));
    expect(screen.getByText("个人待办：缺少 list 数组")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "复制同步诊断" }));
    await screen.findByRole("status");
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain("已读取 0 页 / 0 条");
    expect(writeText.mock.calls[0][0]).not.toMatch(/header-secret|json-secret|bearer-secret/);
    expect(diagnosticText("x".repeat(13000))).toHaveLength(12000);
  });

  it("复制失败提供手动复制提示，不宣称成功", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("unavailable")) } });
    render(<SyncDiagnostics sources={[]} failures={[]} runs={[]} close={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "复制同步诊断" }));
    expect((await screen.findByRole("status")).textContent).toContain("复制失败");
  });
});
