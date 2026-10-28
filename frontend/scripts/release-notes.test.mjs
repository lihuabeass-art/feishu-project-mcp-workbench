import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { appReleaseNotes, compareVersions, generateReleaseNotes, loadBuildReleaseNotes, writeReleaseArtifacts } from "./release-notes.mjs";
import { resolveVersion } from "./version.mjs";

function fixture(t) {
  const prefix = join(tmpdir(), "fstodo-notes-");
  const cwd = mkdtempSync(prefix);
  t.after(() => {
    assert.ok(resolve(cwd).startsWith(resolve(prefix)));
    rmSync(cwd, { recursive: true, force: true });
  });
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "--initial-branch=main");
  const tree = execFileSync("git", ["mktree"], { cwd, input: "", encoding: "utf8" }).trim();
  let head;
  const commit = (message) => {
    head = git("-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit-tree", tree, ...(head ? ["-p", head] : []), "-m", message);
    git("update-ref", "refs/heads/main", head);
    return head;
  };
  commit("chore: 初始化测试项目");
  return { cwd, git, commit, notes: (options = {}) => generateReleaseNotes({ cwd, env: {}, ...options }) };
}

test("语义版本按数字与预发布标识排序，不受 tag 字典顺序影响", () => {
  for (const [left, right] of [["1.9.0", "1.10.0"], ["1.0.0-beta.2", "1.0.0-beta.10"], ["1.0.0-beta-x.1", "1.0.0"], ["1.0.0-1", "1.0.0-alpha"], ["1.0.0-alpha", "1.0.0-alpha.1"]]) {
    assert.equal(compareVersions(left, right), -1);
    assert.equal(compareVersions(right, left), 1);
  }
  assert.equal(compareVersions("1.0.0+one", "1.0.0+two"), 0);
});

test("用户指定版本只生成预览，不创建 tag 或改动工作区", (t) => {
  const f = fixture(t);
  f.commit("feat(work): 新增个人清单");
  const notes = f.notes({ version: "0.5.0" });
  assert.equal(notes.version, "0.5.0");
  assert.equal(notes.tag, null);
  assert.match(notes.markdown, /首个正式版本/);
  assert.match(notes.markdown, /汇总飞书待办、已办和参与事项/);
  assert.doesNotMatch(notes.markdown, /新增个人清单|提交日期|首次版本记录|SQLite|DPAPI|CLI/);
  const prerelease = f.notes({ version: "0.5.0-beta.1" });
  assert.match(prerelease.markdown, /首个预览版本/);
  assert.doesNotMatch(prerelease.markdown, /正式版本/);
  assert.equal(f.git("tag", "--list"), "");
  assert.equal(f.git("status", "--porcelain"), "");
  assert.throws(() => f.notes(), /版本 tag/);
});

test("更新记录排除普通、带范围和带感叹号的 chore，并保留功能与修复", (t) => {
  const f = fixture(t);
  f.git("tag", "v0.4.6");
  f.commit("chore(release): 调整编译流程");
  f.commit("chore!: 更新维护配置");
  f.commit("chore(test)!: 对齐回归断言");
  const maintenance = f.notes({ version: "0.4.7" });
  assert.match(maintenance.markdown, /当前范围没有需要展示的变更/);
  assert.doesNotMatch(maintenance.markdown, /初始化测试项目|调整编译流程|更新维护配置|对齐回归断言|## 维护与文档/);
  f.commit("feat: 支持离线更新记录");
  f.commit("fix: 保留草稿输入");
  f.git("tag", "v0.4.7");
  const notes = f.notes();
  assert.match(notes.markdown, /新增功能\n\n- 支持离线更新记录/);
  assert.match(notes.markdown, /问题修复\n\n- 保留草稿输入/);
  assert.doesNotMatch(notes.markdown, /初始化测试项目|调整编译流程|更新维护配置|对齐回归断言/);
});

test("正式版比较上一个正式 tag，包含预发布期间的变化并正确选择 1.10 而非 1.9", (t) => {
  const f = fixture(t);
  f.git("tag", "v1.9.0");
  f.commit("fix: 已发布的旧修复");
  f.git("tag", "v1.10.0");
  f.commit("feat: 新增版本记录");
  f.git("tag", "v1.11.0-beta.1");
  f.commit("fix: 修复版本展示");
  f.git("tag", "v1.11.0");
  const notes = f.notes();
  assert.equal(notes.previousTag, "v1.10.0");
  assert.match(notes.markdown, /新增版本记录/);
  assert.match(notes.markdown, /修复版本展示/);
  assert.doesNotMatch(notes.markdown, /已发布的旧修复/);
  assert.doesNotMatch(notes.markdown, /https?:\/\//);
});

test("预发布比较上一个较低版本，忽略不在当前历史中的 tag", (t) => {
  const f = fixture(t);
  const rootCommit = f.git("rev-parse", "HEAD");
  f.git("tag", "v1.0.0");
  f.commit("feat: 测试版功能");
  f.git("tag", "v1.1.0-beta.1");
  const unrelatedTree = f.git("rev-parse", `${rootCommit}^{tree}`);
  const other = f.git("-c", "user.name=Release Test", "-c", "user.email=release@example.invalid", "commit-tree", unrelatedTree, "-p", rootCommit, "-m", "other branch");
  f.git("tag", "v1.1.0-beta.9", other);
  f.commit("fix: 第二轮测试修复");
  f.git("tag", "v1.1.0-beta.10");
  const notes = f.notes();
  assert.equal(notes.previousTag, "v1.1.0-beta.1");
  assert.doesNotMatch(notes.markdown, /测试版功能/);
  assert.match(notes.markdown, /第二轮测试修复/);
  assert.throws(() => f.notes({ version: "1.2.0", previousTag: "v1.1.0-beta.9" }), /当前历史可达/);
});

test("本机和 CI 从相同 tag 生成一致记录，可复用快照并拒绝版本或提交不一致", (t) => {
  const f = fixture(t);
  f.git("tag", "v2.0.0");
  const { notes, notesFile } = writeReleaseArtifacts({ cwd: f.cwd, env: {} });
  assert.deepEqual(generateReleaseNotes({ cwd: f.cwd, env: { FSTODO_RELEASE_TAG: "v2.0.0" } }), notes);
  assert.equal(readFileSync(join(f.cwd, "artifacts/release/RELEASE_NOTES.md"), "utf8"), notes.markdown);
  const env = { FSTODO_RELEASE_NOTES_FILE: notesFile };
  assert.deepEqual(loadBuildReleaseNotes({ cwd: f.cwd, env }), notes);
  assert.deepEqual(appReleaseNotes({ cwd: f.cwd, env }), notes);
  for (const changed of [{ version: "2.0.1" }, { tag: "v2.0.1" }, { commit: "0".repeat(40) }, { markdown: "" }]) {
    writeFileSync(notesFile, JSON.stringify({ ...notes, ...changed }));
    assert.throws(() => loadBuildReleaseNotes({ cwd: f.cwd, env }), /不一致/);
  }
});

test("手动 CI 运行明确使用指定 tag，不依赖事件默认分支或任意多 tag", (t) => {
  const f = fixture(t);
  f.git("tag", "v3.0.0-beta.1");
  f.git("tag", "v3.0.0");
  const env = { FSTODO_RELEASE_TAG: "v3.0.0", GITHUB_REF_TYPE: "branch", GITHUB_REF_NAME: "main" };
  assert.equal(resolveVersion({ cwd: f.cwd, release: true, env }), "3.0.0");
  assert.equal(resolveVersion({ cwd: f.cwd, env }), "3.0.0");
  assert.equal(loadBuildReleaseNotes({ cwd: f.cwd, env }).tag, "v3.0.0");
  assert.equal(appReleaseNotes({ cwd: f.cwd, env }).tag, "v3.0.0");
  assert.throws(() => loadBuildReleaseNotes({ cwd: f.cwd, env: { FSTODO_RELEASE_TAG: "main" } }), /构建 tag/);
  assert.throws(() => resolveVersion({ cwd: f.cwd, env: { FSTODO_RELEASE_TAG: "main" } }), /构建 tag/);
});

test("无 tag 的开发界面提供离线提示，不伪造发布记录", (t) => {
  const f = fixture(t);
  const notes = appReleaseNotes({ cwd: f.cwd, env: {} });
  assert.equal(notes.tag, null);
  assert.match(notes.version, /^0\.0\.0-dev\.g/);
  assert.match(notes.markdown, /开发版本/);
});
