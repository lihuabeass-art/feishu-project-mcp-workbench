import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolveVersion, versionFromTag, withVersionConfig } from "./version.mjs";

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "fstodo-version-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  const tree = execFileSync("git", ["mktree"], { cwd, input: "", encoding: "utf8" }).trim();
  const commit = git("-c", "user.name=Version Test", "-c", "user.email=version@example.invalid", "commit-tree", tree, "-m", "fixture");
  git("update-ref", "refs/heads/main", commit);
  return { cwd, git, resolve: (options = {}) => resolveVersion({ cwd, env: {}, ...options }) };
}

test("正式和预发布 tag 保留完整语义化版本，拒绝非法版本", () => {
  for (const [tag, expected] of [["v1.2.3", "1.2.3"], ["1.2.3", "1.2.3"], ["v1.2.3-beta.1+abc", "1.2.3-beta.1+abc"]]) {
    assert.equal(versionFromTag(tag), expected);
  }
  for (const tag of ["v0.1", "v01.2.3", "v1.2.3-beta.01", "release-1.2.3", "v1.2.3-", "v1.2.3\n"]) {
    assert.equal(versionFromTag(tag), null);
  }
});

test("未打 tag 的提交可开发但禁止发版，历史 tag 不能沿用", (t) => {
  const f = fixture(t);
  assert.match(f.resolve(), /^0\.0\.0-dev\.g[0-9a-f]{8,}$/);
  assert.throws(() => f.resolve({ release: true }), /版本 tag/);
  f.git("tag", "v1.2.3");
  assert.equal(f.resolve({ release: true }), "1.2.3");
  const parent = f.git("rev-parse", "HEAD");
  const tree = f.git("rev-parse", "HEAD^{tree}");
  const next = f.git("-c", "user.name=Version Test", "-c", "user.email=version@example.invalid", "commit-tree", tree, "-p", parent, "-m", "next");
  f.git("update-ref", "refs/heads/main", next);
  assert.throws(() => f.resolve({ release: true }), /版本 tag/);
});

test("注解 tag、不带 v 的别名和预发布版本可构建且不修改工作区", (t) => {
  const f = fixture(t);
  f.git("-c", "user.name=Version Test", "-c", "user.email=version@example.invalid", "tag", "-a", "v2.0.0-beta.2", "-m", "beta");
  f.git("tag", "2.0.0-beta.2");
  assert.equal(f.resolve({ release: true }), "2.0.0-beta.2");
  assert.equal(f.git("status", "--porcelain"), "");
  f.git("tag", "v2.0.0");
  assert.throws(() => f.resolve({ release: true }), /多个不同/);
  assert.equal(f.resolve({ release: true, env: { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v2.0.0" } }), "2.0.0");
  assert.throws(() => f.resolve({ release: true, env: { GITHUB_REF_TYPE: "tag", GITHUB_REF_NAME: "v3.0.0" } }), /当前提交/);
});

test("前端子进程继承打包版本，环境变量不能代替发版 tag", (t) => {
  const f = fixture(t);
  assert.equal(f.resolve({ env: { FSTODO_VERSION: "3.4.5-beta.1" } }), "3.4.5-beta.1");
  assert.equal(f.resolve({ env: { FSTODO_VERSION: "0.0.0-dev.g01234567" } }), "0.0.0-dev.g01234567");
  assert.throws(() => f.resolve({ env: { FSTODO_VERSION: "garbage" } }), /有效/);
  assert.throws(() => f.resolve({ release: true, env: { FSTODO_VERSION: "3.4.5" } }), /版本 tag/);
  assert.equal(resolveVersion({ cwd: tmpdir(), env: {} }), "0.0.0-dev");
});

test("版本配置覆盖已有配置且保留 Cargo 参数边界", () => {
  const config = JSON.stringify({ version: "1.2.3" });
  assert.deepEqual(withVersionConfig(["build", "--config", "custom.json", "--", "--locked"], "1.2.3"), ["build", "--config", "custom.json", "--config", config, "--", "--locked"]);
  assert.deepEqual(withVersionConfig(["dev"], "1.2.3"), ["dev", "--config", config]);
});
