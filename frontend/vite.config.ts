import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolveVersion } from "./scripts/version.mjs";
import { appReleaseNotes } from "./scripts/release-notes.mjs";
import { updaterConfig } from "./scripts/updater-config.mjs";

const update = updaterConfig();

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(resolveVersion()),
    __RELEASE_NOTES__: JSON.stringify(appReleaseNotes()),
    __UPDATER_CONFIGURED__: JSON.stringify(update.configured),
    __UPDATE_RELEASES_URL__: JSON.stringify(
      update.endpoints[0]?.replace(/\/download\/latest\.json$/, "") || "",
    ),
  },
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  clearScreen: false,
});
