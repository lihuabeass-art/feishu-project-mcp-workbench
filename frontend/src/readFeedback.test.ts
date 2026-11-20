import { describe, expect, it } from "vitest";
import { readFailureMessage, reportFailure, syncFailureMessage } from "./readFeedback";
import type { SyncReport, SyncRun } from "./types";

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

describe("同步失败反馈", () => {
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

});
