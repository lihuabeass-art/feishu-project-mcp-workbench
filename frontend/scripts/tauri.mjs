import { run } from "@tauri-apps/cli";
import { resolveVersion, withVersionConfig } from "./version.mjs";
import { writeReleaseArtifacts } from "./release-notes.mjs";
import { withUpdaterConfig } from "./updater-config.mjs";

try {
  let args = process.argv.slice(2);
  const command = args[0];
  const help = args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg));
  if (command === "bundle" && !help) {
    throw new Error("请使用 npm run tauri build 完整构建，确保安装包与应用界面使用同一 tag 版本；不支持单独打包旧二进制");
  }
  if (["build", "dev"].includes(command) && !help) {
    const version = resolveVersion({ release: command !== "dev" });
    if (command === "build") {
      process.env.FSTODO_RELEASE_NOTES_FILE = writeReleaseArtifacts().notesFile;
    }
    process.env.FSTODO_VERSION = version;
    args = withVersionConfig(args, version);
    args = withUpdaterConfig(args);
    console.log(`FSTODO v${version}`);
  }
  await run(args, "npm run tauri");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
