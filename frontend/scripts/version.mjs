import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../../", import.meta.url));

export function versionFromTag(tag) {
  const version = tag.replace(/^v/, "");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(version);
  if (!match || match[4]?.split(".").some((part) => /^0\d+$/.test(part))) return null;
  return version;
}

export function resolveVersion({ release = false, cwd = repository, env = process.env } = {}) {
  // Tauri passes the resolved version to its frontend build subprocess.
  if (!release && env.FSTODO_VERSION) {
    const version = versionFromTag(env.FSTODO_VERSION);
    if (!version) throw new Error("FSTODO_VERSION 不是有效的语义化版本号");
    return version;
  }
  const git = (...args) => {
    try {
      return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    } catch {
      return "";
    }
  };
  const tags = git("tag", "--points-at", "HEAD").split(/\r?\n/).filter(Boolean);
  const releaseTag = env.FSTODO_RELEASE_TAG || (env.GITHUB_REF_TYPE === "tag" ? env.GITHUB_REF_NAME : undefined);
  if (releaseTag) {
    const version = versionFromTag(releaseTag);
    if (!version || !tags.includes(releaseTag)) {
      throw new Error("构建 tag 必须指向当前提交，并使用 v主版本.次版本.修订号（可带预发布标识）");
    }
    return version;
  }
  const versions = [...new Set(tags.map(versionFromTag).filter(Boolean))];
  if (versions.length > 1) throw new Error("当前提交有多个不同的版本 tag，请保留唯一发版版本");
  if (versions.length === 1) return versions[0];
  if (release) throw new Error("发版需要当前提交的版本 tag，例如 v0.5.0 或 v0.5.0-beta.1；无需修改代码中的版本号");
  const revision = git("rev-parse", "--short=8", "HEAD");
  return revision ? `0.0.0-dev.g${revision}` : "0.0.0-dev";
}

export function withVersionConfig(args, version) {
  const separator = args.indexOf("--");
  const position = separator < 0 ? args.length : separator;
  return [...args.slice(0, position), "--config", JSON.stringify({ version }), ...args.slice(position)];
}

if (process.argv.includes("--release-version")) {
  console.log(resolveVersion({ release: true }));
}
