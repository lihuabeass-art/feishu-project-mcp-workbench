import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

export type Theme = "light" | "dark" | "system";
export type Appearance = "classic" | "pearl";
export const themeStorageKey = "fstodo.theme.v1";
export const appearanceStorageKey = "fstodo.appearance.v1";
const systemQuery = "(prefers-color-scheme: dark)";
const validTheme = (value: string | null): Theme =>
  value === "light" || value === "dark" ? value : "system";
const validAppearance = (value: string | null): Appearance =>
  value === "pearl" ? "pearl" : "classic";

function loadTheme(): Theme {
  try {
    return validTheme(localStorage.getItem(themeStorageKey));
  } catch {
    return "system";
  }
}

function loadAppearance(): Appearance {
  try {
    return validAppearance(localStorage.getItem(appearanceStorageKey));
  } catch {
    return "classic";
  }
}

const ThemeContext = createContext<{
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
  appearance: Appearance;
  setAppearance: (appearance: Appearance) => void;
  error: string;
} | null>(null);

// 沿用 shadcn/ui 的 Vite ThemeProvider 模式，以根属性和 CSS 语义变量切换主题。
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState(loadTheme);
  const [appearance, updateAppearance] = useState(loadAppearance);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.(systemQuery).matches ?? false,
  );
  const [error, setError] = useState("");
  const [appearanceError, setAppearanceError] = useState("");
  const [windowError, setWindowError] = useState("");
  const windowShown = useRef(false);
  const resolvedTheme =
    theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useLayoutEffect(() => {
    if (!isTauri()) return;
    let active = true;
    const nativeWindow = getCurrentWindow();
    setWindowError("");
    // 原生标题栏不受页面 CSS 控制；null 让窗口恢复跟随系统。
    void nativeWindow
      .setTheme(theme === "system" ? null : theme)
      .catch(() => {
        if (active) {
          setWindowError("窗口标题栏外观未能同步，请重新打开应用。");
        }
      })
      .finally(() => {
        // 启动时先恢复原生配色再展示；外观失败也应允许用户进入应用。
        if (active && !windowShown.current) {
          void nativeWindow.show().then(
            () => {
              windowShown.current = true;
            },
            () => {
              if (active) setWindowError("窗口未能显示，请重新打开应用。");
            },
          );
        }
      });
    return () => {
      active = false;
    };
  }, [theme]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    // 采用 next-themes disableTransitionOnChange 的做法，避免控件各自过渡造成混色。
    root.dataset.themeSwitching = "";
    root.dataset.theme = resolvedTheme;
    root.dataset.appearance = appearance;
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        appearance === "pearl"
          ? resolvedTheme === "dark"
            ? "#141724"
            : "#f3f4fb"
          : resolvedTheme === "dark"
            ? "#141414"
            : "#f3f5f3",
      );
    // 先提交新配色，再在下一任务恢复正常的悬停等过渡。
    void window.getComputedStyle(document.body).color;
    const restoreTransitions = () => delete root.dataset.themeSwitching;
    const timer = window.setTimeout(restoreTransitions, 1);
    return () => {
      window.clearTimeout(timer);
      restoreTransitions();
    };
  }, [resolvedTheme, appearance]);

  useEffect(() => {
    const media = window.matchMedia?.(systemQuery);
    if (!media) return;
    const changed = () => setSystemDark(media.matches);
    changed();
    if (media.addEventListener) {
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    }
    if (media.addListener) {
      media.addListener(changed);
      return () => media.removeListener(changed);
    }
  }, []);

  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) {
        updateTheme(validTheme(event.newValue));
        setError("");
      }
      if (event.key === appearanceStorageKey || event.key === null) {
        updateAppearance(validAppearance(event.newValue));
        setAppearanceError("");
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    updateTheme(next);
    try {
      localStorage.setItem(themeStorageKey, next);
      setError("");
    } catch {
      setError(
        "外观已切换，但未能保存在本机；重启后可能恢复原模式，请重新选择以重试。",
      );
    }
  }, []);

  const setAppearance = useCallback((next: Appearance) => {
    updateAppearance(next);
    try {
      localStorage.setItem(appearanceStorageKey, next);
      setAppearanceError("");
    } catch {
      setAppearanceError(
        "主题风格已切换，但未能保存在本机；重启后可能恢复原风格，请重新选择以重试。",
      );
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        appearance,
        setAppearance,
        error: [error, appearanceError, windowError].filter(Boolean).join(" "),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
