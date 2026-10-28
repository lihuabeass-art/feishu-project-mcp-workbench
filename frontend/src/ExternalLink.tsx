import { useState, type MouseEvent, type ReactNode } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { loadLinkOpeningMode } from "./linkPreferences";

export function ExternalLink({
  href,
  children,
  title,
}: {
  href: string;
  children: ReactNode;
  title?: string;
}) {
  const [error, setError] = useState("");
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isTauri()) return;
    event.preventDefault();
    setError("");
    void invoke<void>("open_external_url", {
      url: href,
      newWindow: loadLinkOpeningMode() === "new-window",
    }).catch((error: unknown) => {
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
