import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { moveTypeKey } from "./model";

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent);
export const typeReorderHint = `拖动或按 ${isMac ? "⌥↑ / ⌥↓" : "Alt+↑ / Alt+↓"} 调整顺序`;

export interface TypeDropTarget {
  key: string;
  after: boolean;
}

// keys 为当前可见的类型，order 为需要持久化的完整顺序（可包含隐藏类型）。
export function useTypeReorder({
  keys,
  order = keys,
  enabled,
  onReorder,
}: {
  keys: string[];
  order?: string[];
  enabled: boolean;
  onReorder: (keys: string[]) => void;
}) {
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TypeDropTarget | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const canReorder = enabled && keys.length > 1;

  function reset() {
    draggingKeyRef.current = null;
    setDraggingKey(null);
    setDropTarget(null);
  }

  function itemProps<T extends HTMLElement>(key: string) {
    return {
      draggable: canReorder,
      onDragStart(event: DragEvent<T>) {
        const control = (event.target as HTMLElement).closest(
          "button, input, label, select, textarea, form",
        );
        if (!canReorder || (control && control !== event.currentTarget)) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", key);
        draggingKeyRef.current = key;
        setDraggingKey(key);
      },
      onDragOver(event: DragEvent<T>) {
        const fromKey = draggingKeyRef.current;
        if (!fromKey) return;
        if (fromKey === key) {
          setDropTarget(null);
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const bounds = event.currentTarget.getBoundingClientRect();
        const after = event.clientY >= bounds.top + bounds.height / 2;
        setDropTarget((current) =>
          current?.key === key && current.after === after
            ? current
            : { key, after },
        );
      },
      onDrop(event: DragEvent<T>) {
        event.preventDefault();
        const fromKey = draggingKeyRef.current;
        reset();
        if (!fromKey) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const after = event.clientY >= bounds.top + bounds.height / 2;
        const next = moveTypeKey(order, fromKey, key, after);
        if (next) onReorder(next);
      },
      onDragEnd: reset,
      onKeyDown(event: KeyboardEvent<T>) {
        if (
          !canReorder ||
          !event.altKey ||
          event.target !== event.currentTarget ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        )
          return;
        const after = event.key === "ArrowDown";
        const neighbor = keys[keys.indexOf(key) + (after ? 1 : -1)];
        if (!neighbor) return;
        event.preventDefault();
        const next = moveTypeKey(order, key, neighbor, after);
        if (next) onReorder(next);
      },
    };
  }

  return { canReorder, draggingKey, dropTarget, itemProps };
}
