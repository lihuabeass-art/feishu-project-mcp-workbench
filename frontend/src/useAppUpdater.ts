import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const preferenceKey = "fstodo.automatic-updates.v1";
const startupDelay = 10_000;
const checkInterval = 6 * 60 * 60 * 1_000;

export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "downloading"
  | "ready"
  | "installing"
  | "error";
type FailureStage = "check" | "download" | "install" | "restart";

export interface UpdateRelease {
  version: string;
  currentVersion: string;
  notes: string;
}

export interface AppUpdateState {
  phase: UpdatePhase;
  open: boolean;
  noticeVisible: boolean;
  release: UpdateRelease | null;
  downloaded: number;
  total: number | null;
  error: string;
  failureStage: FailureStage | null;
}

function loadAutomatic() {
  try {
    return localStorage.getItem(preferenceKey) !== "false";
  } catch {
    return true;
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function useAppUpdater({
  prepareInstall,
  configured = __UPDATER_CONFIGURED__,
}: { prepareInstall?: () => Promise<() => void>; configured?: boolean } = {}) {
  const desktop = isTauri();
  const [automatic, setAutomaticState] = useState(loadAutomatic);
  const automaticRef = useRef(automatic);
  const [preferenceError, setPreferenceError] = useState("");
  const [state, setState] = useState<AppUpdateState>({
    phase: "idle",
    open: false,
    noticeVisible: false,
    release: null,
    downloaded: 0,
    total: null,
    error: "",
    failureStage: null,
  });
  const snapshot = useRef(state);
  const mounted = useRef(false);
  const disposed = useRef(false);
  const busy = useRef(false);
  const update = useRef<Update | null>(null);
  const prepareRef = useRef(prepareInstall);
  prepareRef.current = prepareInstall;

  function publish(patch: Partial<AppUpdateState>) {
    snapshot.current = { ...snapshot.current, ...patch };
    if (mounted.current) setState(snapshot.current);
  }

  async function closeUpdate() {
    const previous = update.current;
    update.current = null;
    if (previous) {
      try {
        await previous.close();
      } catch {
        /* Resource disposal cannot change the result of an update operation. */
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    disposed.current = false;
    return () => {
      mounted.current = false;
      // StrictMode immediately mounts the same hook again. Defer disposal so it
      // cannot close a resource that the replayed effect is still using.
      queueMicrotask(() => {
        if (!mounted.current) {
          disposed.current = true;
          if (!busy.current) void closeUpdate();
        }
      });
    };
  }, []);

  async function checkForUpdate(manual = true, replace = false) {
    if (!desktop || !configured || disposed.current) return;
    if (!manual && !automaticRef.current) return;
    if (busy.current) return;
    if (!replace && update.current) return;
    if (!manual && ["ready", "installing"].includes(snapshot.current.phase))
      return;
    if (!manual && snapshot.current.failureStage === "restart") return;
    busy.current = true;
    publish({
      phase: "checking",
      noticeVisible: false,
      error: "",
      failureStage: null,
    });
    try {
      await closeUpdate();
      const found = await check({ timeout: 20_000 });
      if (disposed.current || !mounted.current) {
        await found?.close();
        return;
      }
      // Turning automatic updates off also applies to a check already in flight.
      if (!manual && !automaticRef.current) {
        await found?.close();
        publish({ phase: "idle", release: null, downloaded: 0, total: null });
        return;
      }
      update.current = found;
      if (found) {
        publish({
          release: {
            version: found.version,
            currentVersion: found.currentVersion,
            notes: found.body || "",
          },
        });
        // Keep the same lock from checking through download so manual actions
        // and timer callbacks cannot start a second transfer.
        await downloadCandidate(found);
      } else {
        publish({
          phase: "current",
          release: null,
          downloaded: 0,
          total: null,
        });
      }
    } catch (error) {
      publish({
        phase: "error",
        noticeVisible: true,
        error: message(error),
        failureStage: "check",
      });
    } finally {
      busy.current = false;
      if (disposed.current) void closeUpdate();
    }
  }

  const checkRef = useRef(checkForUpdate);
  checkRef.current = checkForUpdate;
  useEffect(() => {
    if (!desktop || !configured || !automatic) return;
    const startup = window.setTimeout(
      () => void checkRef.current(false),
      startupDelay,
    );
    const interval = window.setInterval(
      () => void checkRef.current(false),
      checkInterval,
    );
    return () => {
      window.clearTimeout(startup);
      window.clearInterval(interval);
    };
  }, [desktop, configured, automatic]);

  async function downloadCandidate(candidate: Update) {
    publish({
      phase: "downloading",
      noticeVisible: false,
      downloaded: 0,
      total: null,
      error: "",
      failureStage: null,
    });
    try {
      await candidate.download((event) => {
        if (!mounted.current) return;
        if (event.event === "Started")
          publish({ total: event.data.contentLength || null });
        if (event.event === "Progress")
          publish({
            downloaded: snapshot.current.downloaded + event.data.chunkLength,
          });
      });
      // Finished reports transfer completion before signature verification. Only
      // the fulfilled download promise confirms that installation can be offered.
      if (!disposed.current) publish({ phase: "ready", noticeVisible: true });
    } catch (error) {
      publish({
        phase: "error",
        noticeVisible: true,
        error: message(error),
        failureStage: "download",
      });
    }
  }

  async function retryDownload() {
    if (
      !desktop ||
      busy.current ||
      !update.current ||
      disposed.current ||
      snapshot.current.failureStage !== "download"
    )
      return;
    busy.current = true;
    try {
      await downloadCandidate(update.current);
    } finally {
      busy.current = false;
      if (disposed.current) void closeUpdate();
    }
  }

  async function install(restartOnly = false) {
    if (!desktop || busy.current || disposed.current) return;
    if (
      restartOnly
        ? snapshot.current.failureStage !== "restart"
        : snapshot.current.phase !== "ready" || !update.current
    )
      return;
    busy.current = true;
    publish({
      phase: "installing",
      open: true,
      noticeVisible: false,
      error: "",
      failureStage: null,
    });
    let releaseLock: (() => void) | undefined;
    let installed = restartOnly;
    try {
      releaseLock = await prepareRef.current?.();
      if (disposed.current || !mounted.current) return;
      if (!restartOnly) {
        await update.current!.install();
        installed = true;
      }
      // Windows' installer exits the process itself; macOS needs an explicit
      // relaunch after replacing the application bundle.
      await relaunch();
    } catch (error) {
      publish({
        phase: "error",
        noticeVisible: true,
        error: message(error),
        failureStage: installed ? "restart" : "install",
      });
    } finally {
      releaseLock?.();
      busy.current = false;
      if (installed || disposed.current) await closeUpdate();
    }
  }

  function setAutomatic(next: boolean) {
    automaticRef.current = next;
    setAutomaticState(next);
    try {
      localStorage.setItem(preferenceKey, String(next));
      setPreferenceError("");
    } catch {
      setPreferenceError(
        "本次设置已生效，但未能保存在本机；重启后可能恢复原设置。",
      );
    }
  }

  return {
    desktop,
    configured,
    automatic,
    preferenceError,
    state,
    setAutomatic,
    check: () => void checkForUpdate(),
    open: () => publish({ open: true }),
    dismissNotice: () => publish({ noticeVisible: false }),
    dismiss: () => {
      if (snapshot.current.phase !== "installing")
        publish({ open: false, noticeVisible: false });
    },
    install: () => void install(),
    retry: () => {
      if (snapshot.current.failureStage === "download") void retryDownload();
      else if (snapshot.current.failureStage === "restart") void install(true);
      else void checkForUpdate(true, true);
    },
  };
}

export type AppUpdaterController = ReturnType<typeof useAppUpdater>;
