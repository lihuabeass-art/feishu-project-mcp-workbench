// 使用外部同步脚本在首帧前恢复主题，兼容桌面端不允许内联脚本的 CSP。
(() => {
  let theme = "system";
  let appearance = "classic";
  try {
    const saved = localStorage.getItem("fstodo.theme.v1");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch {}
  try {
    if (localStorage.getItem("fstodo.appearance.v1") === "pearl") {
      appearance = "pearl";
    }
  } catch {}
  const resolved =
    theme === "system"
      ? window.matchMedia?.("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.appearance = appearance;
  document.documentElement.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      "content",
      appearance === "pearl"
        ? resolved === "dark"
          ? "#141724"
          : "#f3f4fb"
        : resolved === "dark"
          ? "#141414"
          : "#f3f5f3",
    );
})();
