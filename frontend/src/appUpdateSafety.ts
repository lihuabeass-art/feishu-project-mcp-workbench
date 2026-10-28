type BusyRef = { current: boolean };

export async function prepareUpdateInstallation({
  busy, workflow, blockedReason, onBusyChange, flush,
}: {
  busy: BusyRef;
  workflow: BusyRef;
  blockedReason?: string;
  onBusyChange: (locked: boolean) => void;
  flush: () => Promise<void>;
}): Promise<() => void> {
  if (busy.current || workflow.current) {
    throw new Error("当前操作尚未结束，请等待同步、保存或流程提交完成后再安装。");
  }
  if (blockedReason) throw new Error(blockedReason);
  // 先持锁再等待持久化，防止自动同步或新的流程写入在等待期间启动。
  busy.current = true;
  onBusyChange(true);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    busy.current = false;
    onBusyChange(false);
  };
  try {
    await flush();
    return release;
  } catch (error) {
    release();
    throw error;
  }
}
