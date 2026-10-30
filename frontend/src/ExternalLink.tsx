import { useState, type MouseEvent, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadLinkOpeningMode } from "./linkPreferences";

export async function openExternalUrl(href: string) {
  if (isTauri()) {
    await invoke<void>("open_external_url", {
      url: href,
      newWindow: loadLinkOpeningMode() === "new-window",
    });
    return;
  }
  const opened = window.open(href, "_blank");
  if (!opened) throw new Error("浏览器未能打开链接");
  opened.opener = null;
}

export function ExternalLink({
  href,
  children,
  title,
  onOpen,
}: {
  href: string;
  children: ReactNode;
  title?: string;
  onOpen?: () => void;
}) {
  const [error, setError] = useState("");
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) {
      onOpen?.();
      return;
    }
    event.preventDefault();
    setError("");
    void openExternalUrl(href).then(() => onOpen?.()).catch((error: unknown) => {
      setError(
        typeof error === "string"
          ? error
          : "链接打开失败，请重试或复制链接到浏览器打开",
      );
    });
  };
  return (
    <>
      <a
        href={href}
        title={title}
        target="_blank"
        rel="noreferrer"
        onClick={open}
        onAuxClick={(event) => {
          if (event.button === 1) open(event);
        }}
      >
        {children}
      </a>
      {error && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
