import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { generateUpdateManifest, writeUpdateManifest } from "./update-manifest.mjs";

function fixture(t) {
  const prefix = join(tmpdir(), "fstodo-updater-");
  const directory = mkdtempSync(prefix);
  t.after(() => {
    assert.ok(resolve(directory).startsWith(resolve(prefix)));
    rmSync(directory, { recursive: true, force: true });
  });
  const options = {
    version: "0.5.0", repo: "example-org/fstodo-releases", windows: join(directory, "飞书 FSTODO_0.5.0_x64-setup.exe"),
    macos: join(directory, "飞书 FSTODO.app.tar.gz"), notes: join(directory, "windows-release.json"),
    macosNotes: join(directory, "macos-release.json"), output: join(directory, "latest.json"),
  };
  const notes = { version: "0.5.0", tag: "v0.5.0", commit: "a".repeat(40), date: "2026-10-28", markdown: "# FSTODO 0.5.0\n\n- 自动更新\n" };
  const signature = Buffer.from("untrusted comment: test signature\nRWQtest\ntrusted comment: test\nTest\n").toString("base64");
  for (const path of [options.windows, options.macos]) {
    writeFileSync(path, "fixture package");
    writeFileSync(`${path}.sig`, `${signature}\n`);
  }
  for (const path of [options.notes, options.macosNotes]) writeFileSync(path, JSON.stringify(notes));
  return { options, notes, signature };
}

test("完整签名包生成 JSON，Mac 两种架构共用 Universal，URL 固定版本且编码资源名", (t) => {
  const { options, notes, signature } = fixture(t);
  const manifest = writeUpdateManifest(options);
  assert.deepEqual(JSON.parse(readFileSync(options.output, "utf8")), manifest);
  assert.equal(manifest.version, notes.version);
  assert.equal(manifest.notes, notes.markdown);
  assert.equal(manifest.pub_date, "2026-10-28T00:00:00Z");
  assert.deepEqual(Object.keys(manifest.platforms), ["windows-x86_64", "darwin-aarch64", "darwin-x86_64"]);
  assert.deepEqual(manifest.platforms["darwin-aarch64"], manifest.platforms["darwin-x86_64"]);
  assert.equal(manifest.platforms["windows-x86_64"].signature, signature);
  assert.equal(manifest.platforms["windows-x86_64"].url, "https://github.com/example-org/fstodo-releases/releases/download/v0.5.0/%E9%A3%9E%E4%B9%A6%20FSTODO_0.5.0_x64-setup.exe");
  assert.equal(manifest.platforms["darwin-aarch64"].url, "https://github.com/example-org/fstodo-releases/releases/download/v0.5.0/%E9%A3%9E%E4%B9%A6%20FSTODO.app.tar.gz");
});

test("缺少任一平台或签名时不覆盖已生成清单", (t) => {
  const { options } = fixture(t);
  writeFileSync(options.output, "existing manifest");
  for (const field of ["windows", "macos", "notes", "macosNotes"]) {
    assert.throws(() => writeUpdateManifest({ ...options, [field]: undefined }), /缺少/);
    assert.equal(readFileSync(options.output, "utf8"), "existing manifest");
  }
  for (const field of ["windows", "macos"]) {
    rmSync(`${options[field]}.sig`);
    assert.throws(() => writeUpdateManifest(options), /ENOENT/);
    assert.equal(readFileSync(options.output, "utf8"), "existing manifest");
    writeFileSync(`${options[field]}.sig`, Buffer.from("signature").toString("base64"));
  }
});

test("签名必须是内容，拒绝空值、路径和无效 Base64", (t) => {
  const { options } = fixture(t);
  for (const signature of ["", "  \n", "C:\\keys\\update.sig", "./FSTODO.sig", "not a signature", "ab=", "ZE=="]) {
    writeFileSync(`${options.windows}.sig`, signature);
    assert.throws(() => generateUpdateManifest(options), /Base64 签名内容/);
  }
});

test("拒绝无效版本、版本不匹配的安装包及两个平台不一致的记录", (t) => {
  const { options, notes } = fixture(t);
  for (const version of ["v0.5.0", "0.05.0", "0.5", "1.0.0-beta.01", "latest", undefined]) {
    assert.throws(() => generateUpdateManifest({ ...options, version }), /语义版本号/);
  }
  const wrongPackage = join(join(options.output, ".."), "FSTODO_0.4.9_x64-setup.exe");
  writeFileSync(wrongPackage, "old package");
  writeFileSync(`${wrongPackage}.sig`, Buffer.from("signature").toString("base64"));
  assert.throws(() => generateUpdateManifest({ ...options, windows: wrongPackage }), /相同版本号/);
  for (const delta of [{ version: "0.4.9" }, { tag: "v0.4.9" }, { tag: "0.5.0" }, { commit: "b".repeat(40) }, { date: "2026-02-30" }, { markdown: "" }]) {
    writeFileSync(options.macosNotes, JSON.stringify({ ...notes, ...delta }));
    assert.throws(() => generateUpdateManifest(options), /不一致|无效/);
  }
});

test("同版本同 tag 同提交的两端记录可有各自日期与正文，清单沿用 Windows 记录", (t) => {
  const { options, notes } = fixture(t);
  writeFileSync(options.macosNotes, JSON.stringify({ ...notes, date: "2026-10-27", markdown: "Mac build notes" }));
  const manifest = generateUpdateManifest(options);
  assert.equal(manifest.notes, notes.markdown);
  assert.equal(manifest.pub_date, `${notes.date}T00:00:00Z`);
});

test("需要显式仓库，拒绝 URL 或路径，输出不覆盖输入", (t) => {
  const { options } = fixture(t);
  for (const repo of [undefined, "https://github.com/owner/repo", "owner/repo/extra", "owner/..", "owner/repo?token=secret"]) {
    assert.throws(() => generateUpdateManifest({ ...options, repo }), /公开分发仓库/);
  }
  assert.throws(() => writeUpdateManifest({ ...options, output: options.windows }), /不能覆盖/);
});
