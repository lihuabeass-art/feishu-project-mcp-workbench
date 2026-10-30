import { Channel, Resource, invoke } from "@tauri-apps/api/core";
import {
  Update as OfficialUpdate,
  type DownloadEvent as OfficialDownloadEvent,
} from "@tauri-apps/plugin-updater";

export type DownloadEvent =
  | OfficialDownloadEvent
  | {
      event: "Started";
      data: { contentLength: number | null; downloaded: number };
    }
  | { event: "Retrying"; data: { attempt: number; maxAttempts: number } };

// Keep the official version/platform selection and OS installers. The native
// transport owns partial bytes and only returns an install resource after verification.
export class Update {
  private session: Resource | null = null;
  private verified: Resource | null = null;

  constructor(private readonly candidate: OfficialUpdate) {}

  get version() {
    return this.candidate.version;
  }
  get currentVersion() {
    return this.candidate.currentVersion;
  }
  get body() {
    return this.candidate.body;
  }

  async download(onEvent: (event: DownloadEvent) => void) {
    if (!this.session) {
      this.session = new Resource(
        await invoke<number>("begin_update_download", {
          rid: this.candidate.rid,
        }),
      );
    }
    const channel = new Channel<DownloadEvent>();
    channel.onmessage = onEvent;
    const rid = await invoke<number>("download_update", {
      rid: this.session.rid,
      onEvent: channel,
    });
    this.verified = new Resource(rid);
  }

  async install() {
    if (!this.verified) throw new Error("更新包尚未下载并通过签名校验");
    await invoke("install_verified_update", { rid: this.verified.rid });
  }

  async close() {
    // Attempt every close even if one resource has already been released.
    await Promise.allSettled([
      this.verified?.close(),
      this.session?.close(),
      this.candidate.close(),
    ]);
    this.verified = null;
    this.session = null;
  }
}

export async function check(options?: { timeout?: number }) {
  const metadata = await invoke<
    ConstructorParameters<typeof OfficialUpdate>[0] | null
  >("check_app_update", { timeout: options?.timeout });
  return metadata ? new Update(new OfficialUpdate(metadata)) : null;
}
