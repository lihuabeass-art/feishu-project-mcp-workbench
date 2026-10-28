import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { versionFromTag } from "./version.mjs";

function artifact(path, label, extension) {
  if (!path) throw new Error(`缺少${label}完整更新包`);
  const absolute = resolve(path);
  if (!basename(absolute).endsWith(extension) || !statSync(absolute).isFile() || statSync(absolute).size === 0) {
    throw new Error(`${label}必须是非空的 ${extension} 文件`);
  }
  const signaturePath = `${absolute}.sig`;
  const signature = readFileSync(signaturePath, "utf8").trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signature) || signature.length % 4 !== 0 || Buffer.from(signature, "base64").toString("base64") !== signature) {
    throw new Error(`${label} .sig 必须包含有效的 Base64 签名内容，不能填写文件路径`);
  }
  return { path: absolute, signaturePath, signature, name: basename(absolute) };
}

function releaseNotes(path, version, label) {
  if (!path) throw new Error(`缺少${label}构建的 release.json`);
  const notes = JSON.parse(readFileSync(path, "utf8"));
  if (notes.version !== version || typeof notes.tag !== "string" || versionFromTag(notes.tag) !== version ||
    !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(notes.commit || "") ||
    typeof notes.markdown !== "string" || !notes.markdown.trim() ||
    !/^\d{4}-\d{2}-\d{2}$/.test(notes.date || "") || !Number.isFinite(Date.parse(`${notes.date}T00:00:00Z`)) ||
    new Date(`${notes.date}T00:00:00Z`).toISOString().slice(0, 10) !== notes.date) {
    throw new Error(`${label}变更记录的版本、tag、提交、日期或正文无效，必须使用同一版本构建生成的 release.json`);
  }
  return notes;
}

export function generateUpdateManifest({ version, windows, macos, notes: notesPath, macosNotes, repo } = {}) {
  if (!version || versionFromTag(version) !== version) throw new Error("--version 必须是有效语义版本号，不带 v 前缀");
  if (!repo || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(repo) || repo.endsWith("/.") || repo.endsWith("/..")) {
    throw new Error("--repo 必须显式指定公开分发仓库，格式为 owner/repo");
  }
  const notes = releaseNotes(notesPath, version, "Windows");
  const macNotes = releaseNotes(macosNotes, version, "macOS");
  for (const field of ["version", "tag", "commit"]) {
    if (notes[field] !== macNotes[field]) throw new Error(`Windows 与 macOS 变更记录的 ${field} 不一致，不能混合发布`);
  }
  const win = artifact(windows, "Windows", ".exe");
  if (!win.name.endsWith(`_${version}_x64-setup.exe`)) throw new Error("Windows 安装包文件名必须包含相同版本号与 x64-setup.exe 标识");
  const mac = artifact(macos, "macOS", ".app.tar.gz");
  const base = `https://github.com/${repo}/releases/download/${encodeURIComponent(notes.tag)}`;
  const entry = (file) => ({ signature: file.signature, url: `${base}/${encodeURIComponent(file.name)}` });
  return {
    version,
    notes: notes.markdown,
    pub_date: `${notes.date}T00:00:00Z`,
    platforms: {
      "windows-x86_64": entry(win),
      "darwin-aarch64": entry(mac),
      "darwin-x86_64": entry(mac),
    },
  };
}

export function writeUpdateManifest(options) {
  const manifest = generateUpdateManifest(options);
  if (!options.output) throw new Error("缺少 --output latest.json 输出路径");
  const output = resolve(options.output);
  const inputs = [options.windows, `${options.windows}.sig`, options.macos, `${options.macos}.sig`, options.notes, options.macosNotes].map((path) => resolve(path));
  if (inputs.includes(output)) throw new Error("清单输出不能覆盖安装包、签名或变更记录");
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
  return manifest;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: Object.fromEntries(["version", "windows", "macos", "notes", "macos-notes", "repo", "output"].map((name) => [name, { type: "string" }])) });
    const manifest = writeUpdateManifest({ ...values, macosNotes: values["macos-notes"] });
    console.log(`已生成 FSTODO ${manifest.version} 的 Windows / macOS 完整更新清单`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
