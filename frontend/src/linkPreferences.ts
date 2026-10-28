export type LinkOpeningMode = "new-window" | "existing-browser";

const key = "fstodo.link-opening-mode.v1";

export function loadLinkOpeningMode(): LinkOpeningMode {
  try {
    return localStorage.getItem(key) === "existing-browser"
      ? "existing-browser"
      : "new-window";
  } catch {
    return "new-window";
  }
}

export function saveLinkOpeningMode(mode: LinkOpeningMode) {
  localStorage.setItem(key, mode);
}
