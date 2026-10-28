import { invoke, isTauri } from "@tauri-apps/api/core";

export interface LinkMetadata {
  title: string;
  kind: "webpage" | "document" | "file";
}

export const loadLinkMetadata = (url: string): Promise<LinkMetadata | null> =>
  isTauri()
    ? invoke<LinkMetadata | null>("resolve_link_metadata", { url })
    : Promise.resolve(null);
