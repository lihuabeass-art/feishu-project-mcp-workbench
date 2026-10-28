import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { resolveVersion, versionFromTag } from "./version.mjs";

const repository = fileURLToPath(new URL("../../", import.meta.url));

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).trim();
}

function parts(version) {
  const value = version.split("+")[0];
  const separator = value.indexOf("-");
  return {
    core: (separator < 0 ? value : value.slice(0, separator)).split(".").map(BigInt),
    pre: separator < 0 ? [] : value.slice(separator + 1).split("."),
  };
}

export function compareVersions(left, right) {
  const a = parts(left), b = parts(right);
  for (let i = 0; i < 3; i++) {
    if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
  }
  if (!a.pre.length || !b.pre.length) return a.pre.length === b.pre.length ? 0 : a.pre.length ? -1 : 1;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i++) {
    const x = a.pre[i], y = b.pre[i];
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? -1 : 1;
    if (x === y) continue;
    const numericX = /^\d+$/.test(x), numericY = /^\d+$/.test(y);
    if (numericX && numericY) return BigInt(x) > BigInt(y) ? 1 : -1;
    if (numericX !== numericY) return numericX ? -1 : 1;
    return x > y ? 1 : -1;
  }
  return 0;
}

function releaseTarget(cwd, env, tag) {
  const version = resolveVersion({ cwd, release: true, env: tag ? { ...env, FSTODO_RELEASE_TAG: tag } : env });
  const tags = git(cwd, "tag", "--points-at", "HEAD").split(/\r?\n/).filter((value) => versionFromTag(value) === version);
  return { version, tag: tag || env.FSTODO_RELEASE_TAG || (env.GITHUB_REF_TYPE === "tag" ? env.GITHUB_REF_NAME : tags.find((value) => value === `v${version}`) || tags[0]) };
}

function previousRelease(cwd, version, previousTag) {
  const tags = git(cwd, "tag", "--merged", "HEAD").split(/\r?\n/).filter(Boolean);
  if (previousTag) {
    const previousVersion = versionFromTag(previousTag);
    if (!tags.includes(previousTag) || !previousVersion || compareVersions(previousVersion, version) >= 0) {
      throw new Error("比较起点必须是当前历史可达、且版本号小于本次版本的 tag");
    }
    return previousTag;
  }
  const stable = !parts(version).pre.length;
  const candidates = tags.filter((tag) => {
    const value = versionFromTag(tag);
    return value && compareVersions(value, version) < 0 && (!stable || !parts(value).pre.length);
  });
  candidates.sort((a, b) => compareVersions(versionFromTag(b), versionFromTag(a)) || a.localeCompare(b));
  return candidates[0] || null;
}

export function generateReleaseNotes({ cwd = repository, env = process.env, version, tag, previousTag } = {}) {
  if (version && tag) throw new Error("版本预览与已打 tag 的构建不能同时指定");
  const target = version ? { version: versionFromTag(version), tag: null } : releaseTarget(cwd, env, tag);
  if (!target.version) throw new Error("请先由用户指定有效版本号，例如 0.5.0 或 0.5.0-beta.1");
  const commit = git(cwd, "rev-parse", "HEAD");
  const previous = previousRelease(cwd, target.version, previousTag);
  const date = git(cwd, "show", "-s", "--format=%cs", commit);
  if (!previous) {
    const introduction = readFileSync(new URL("../../docs/first-release-notes.md", import.meta.url), "utf8").trim();
    const label = parts(target.version).pre.length ? "首个预览版本" : "首个正式版本";
    const markdown = `# FSTODO ${target.version}\n\n${label}，${introduction}\n`;
    return { version: target.version, tag: target.tag, previousTag: null, commit, date, markdown };
  }
  const previousCommit = previous ? git(cwd, "rev-parse", `refs/tags/${previous}^{commit}`) : null;
  const range = previousCommit ? `${previousCommit}..${commit}` : commit;
  const commits = git(cwd, "log", "--reverse", "--no-merges", "--format=%H%x1f%s%x1e", range, "--")
    .split("\x1e").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const [sha, subject] = entry.split("\x1f");
      return { sha, subject };
    });
  const groups = new Map([["新增功能", []], ["问题修复", []], ["体验优化", []], ["维护与文档", []], ["其他变化", []]]);
  for (const { subject } of commits) {
    const match = /^(\w+)(?:\([^)]+\))?!?:\s*(.+)$/.exec(subject);
    const type = match?.[1], text = match?.[2] || subject;
    if (type === "chore") continue;
    const group = type === "feat" ? "新增功能" : type === "fix" ? "问题修复" : ["perf", "refactor", "style"].includes(type) ? "体验优化" : ["docs", "test", "build", "ci"].includes(type) ? "维护与文档" : "其他变化";
    groups.get(group).push(text);
  }
  const sections = [...groups].filter(([, entries]) => entries.length).map(([title, entries]) => `## ${title}\n\n${entries.map((entry) => `- ${entry}`).join("\n")}`);
  const markdown = [
    `# FSTODO ${target.version}`,
    `提交日期：${date}`,
    previous ? `比较起点：${previous}` : "首次版本记录：当前提交的完整历史。",
    sections.length ? sections.join("\n\n") : "当前范围没有需要展示的变更。",
  ].filter(Boolean).join("\n\n") + "\n";
  return { version: target.version, tag: target.tag, previousTag: previous, commit, date, markdown };
}

export function loadBuildReleaseNotes({ cwd = repository, env = process.env } = {}) {
  const target = releaseTarget(cwd, env);
  if (!env.FSTODO_RELEASE_NOTES_FILE) return generateReleaseNotes({ cwd, env, tag: target.tag });
  const notes = JSON.parse(readFileSync(resolve(cwd, env.FSTODO_RELEASE_NOTES_FILE), "utf8"));
  if (notes.version !== target.version || notes.tag !== target.tag || notes.commit !== git(cwd, "rev-parse", "HEAD") || typeof notes.markdown !== "string" || !notes.markdown.trim()) {
    throw new Error("变更记录与当前 tag、版本号或提交不一致，不能用于本次构建");
  }
  return notes;
}

export function appReleaseNotes({ cwd = repository, env = process.env } = {}) {
  const version = resolveVersion({ cwd, env });
  if (env.FSTODO_RELEASE_NOTES_FILE) return loadBuildReleaseNotes({ cwd, env });
  try {
    const target = releaseTarget(cwd, env);
    if (target.version === version) return generateReleaseNotes({ cwd, env, tag: target.tag });
  } catch {
    // Untagged development and source archives have no published release notes.
  }
  return { version, tag: null, previousTag: null, commit: null, date: null, markdown: "这是开发版本，正式版本的更新记录将在发版构建时生成。" };
}

export function writeReleaseArtifacts({ cwd = repository, env = process.env, output = join(cwd, "artifacts/release") } = {}) {
  const notes = loadBuildReleaseNotes({ cwd, env });
  mkdirSync(output, { recursive: true });
  const notesFile = join(output, "release.json");
  writeFileSync(notesFile, JSON.stringify(notes, null, 2) + "\n");
  writeFileSync(join(output, "RELEASE_NOTES.md"), notes.markdown);
  return { notes, notesFile };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { values } = parseArgs({ options: { version: { type: "string" }, tag: { type: "string" }, "previous-tag": { type: "string" }, output: { type: "string" }, "github-output": { type: "string" } } });
    if (values.output && (values.version || values["previous-tag"])) throw new Error("预览参数不能用于正式构建输出；构建从当前 tag 自动确定版本与比较起点");
    if (values.output) {
      const env = values.tag ? { ...process.env, FSTODO_RELEASE_TAG: values.tag } : process.env;
      const { notes } = writeReleaseArtifacts({ env, output: resolve(values.output) });
      if (values["github-output"]) appendFileSync(values["github-output"], `version=${notes.version}\ntag=${notes.tag}\n`);
      console.log(`已生成 FSTODO ${notes.version} 的变更记录`);
    } else {
      console.log(generateReleaseNotes({ version: values.version, tag: values.tag, previousTag: values["previous-tag"] }).markdown);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
