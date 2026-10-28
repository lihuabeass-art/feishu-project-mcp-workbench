import assert from "node:assert/strict";
import { test } from "node:test";
import { updaterConfig, withUpdaterConfig } from "./updater-config.mjs";

test("未提供公开仓库时明确禁用，环境变量可覆盖持久构建配置", () => {
  assert.deepEqual(updaterConfig({ env: {}, config: { repository: null } }), { configured: false, endpoints: [] });
  assert.deepEqual(updaterConfig({ env: {}, config: { repository: "owner/releases" } }), { configured: true, endpoints: ["https://github.com/owner/releases/releases/latest/download/latest.json"] });
  assert.deepEqual(updaterConfig({ env: { FSTODO_UPDATE_REPOSITORY: "" }, config: { repository: "owner/releases" } }), { configured: false, endpoints: [] });
  assert.equal(updaterConfig({ env: { FSTODO_UPDATE_REPOSITORY: "another/release-repo" }, config: { repository: null } }).configured, true);
});

test("拒绝任意URL、路径和非法仓库值", () => {
  for (const repository of ["https://github.com/owner/repo", "owner/repo/extra", "owner/..", " owner/repo", "owner/repo?token=secret", 123]) {
    assert.throws(() => updaterConfig({ env: {}, config: { repository } }), /owner\/repo/);
  }
});

test("更新配置覆盖与前端一致的来源，仅签名构建生成更新包且保留Cargo参数边界", () => {
  const config = { repository: "owner/releases" };
  const args = ["build", "--config", "macos.json", "--", "--locked"];
  const withoutKey = withUpdaterConfig(args, { env: {}, config });
  assert.deepEqual(withoutKey.slice(-2), ["--", "--locked"]);
  assert.equal(JSON.parse(withoutKey[4]).bundle, undefined);
  const signed = withUpdaterConfig(args, { env: { TAURI_SIGNING_PRIVATE_KEY: "private-value" }, config });
  assert.deepEqual(JSON.parse(signed[4]).bundle, { createUpdaterArtifacts: true });
  assert.ok(!signed.join(" ").includes("private-value"));
  const dev = withUpdaterConfig(["dev"], { env: { TAURI_SIGNING_PRIVATE_KEY: "private-value" }, config });
  assert.equal(JSON.parse(dev[2]).bundle, undefined);
});
