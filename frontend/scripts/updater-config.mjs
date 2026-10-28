import { readFileSync } from "node:fs";

const configFile = new URL("../update-config.json", import.meta.url);

export function updaterConfig({ env = process.env, config = JSON.parse(readFileSync(configFile, "utf8")) } = {}) {
  const repository = env.FSTODO_UPDATE_REPOSITORY ?? config.repository;
  if (repository == null || repository === "") return { configured: false, endpoints: [] };
  if (typeof repository !== "string" || !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9_.-]+$/.test(repository) || /\/(?:\.|\.\.)$/.test(repository)) {
    throw new Error("FSTODO_UPDATE_REPOSITORY / update-config.json.repository 必须是公开 GitHub 仓库的 owner/repo");
  }
  return {
    configured: true,
    endpoints: [`https://github.com/${repository}/releases/latest/download/latest.json`],
  };
}

export function withUpdaterConfig(args, { env = process.env, config } = {}) {
  const update = updaterConfig({ env, config });
  const override = { plugins: { updater: { endpoints: update.endpoints } } };
  // 日常构建无需私钥；只有明确提供签名密钥时才生成可分发的更新产物。
  if (args[0] === "build" && env.TAURI_SIGNING_PRIVATE_KEY) {
    override.bundle = { createUpdaterArtifacts: true };
  }
  const separator = args.indexOf("--");
  const position = separator < 0 ? args.length : separator;
  return [...args.slice(0, position), "--config", JSON.stringify(override), ...args.slice(position)];
}
