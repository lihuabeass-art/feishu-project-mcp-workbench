import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, RotateCcw, X } from "lucide-react";
import styles from "./ImagePreview.module.css";

type Point = { x: number; y: number };
type Size = { width: number; height: number };
const origin: Point = { x: 0, y: 0 };

export function ImagePreview({
  src,
  alt,
  close,
}: {
  src: string;
  alt: string;
  close: () => void;
}) {
  const [natural, setNatural] = useState<Size>({ width: 0, height: 0 });
  const [space, setSpace] = useState<Size>({ width: 0, height: 0 });
  const [view, setView] = useState({ zoom: 1, position: origin });
  const [dragging, setDragging] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  const drag = useRef<{
    pointerId: number;
    start: Point;
    position: Point;
  } | null>(null);
  const fit =
    natural.width && natural.height
      ? Math.min(1, space.width / natural.width, space.height / natural.height)
      : 0;
  const base = { width: natural.width * fit, height: natural.height * fit };

  function constrain(position: Point, zoom: number): Point {
    const maxX = Math.max(0, (base.width * zoom - space.width) / 2);
    const maxY = Math.max(0, (base.height * zoom - space.height) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, position.x)),
      y: Math.max(-maxY, Math.min(maxY, position.y)),
    };
  }
  // Recompute bounds when the viewport changes, without leaving the image off-screen.
  const position = constrain(view.position, view.zoom);
  const geometry = useRef({ base, space, constrain });
  geometry.current = { base, space, constrain };

  function reset() {
    setView({ zoom: 1, position: origin });
  }

  function zoomBy(factor: number, anchor: Point = origin) {
    setView((current) => {
      const zoom = Math.max(1, Math.min(5, current.zoom * factor));
      const ratio = zoom / current.zoom;
      const previous = constrain(current.position, current.zoom);
      return {
        zoom,
        position: constrain(
          {
            x: anchor.x - (anchor.x - previous.x) * ratio,
            y: anchor.y - (anchor.y - previous.y) * ratio,
          },
          zoom,
        ),
      };
    });
  }

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      setSpace({ width: bounds.width, height: bounds.height });
      setView((current) => ({ ...current, position: origin }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    // A native, non-passive listener prevents wheel/pinch from zooming the page.
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const rect = element!.getBoundingClientRect();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1);
      const anchor = {
        x: event.clientX - rect.left - rect.width / 2,
        y: event.clientY - rect.top - rect.height / 2,
      };
      setView((current) => {
        const zoom = Math.max(
          1,
          Math.min(
            5,
            current.zoom *
              Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.002),
          ),
        );
        const ratio = zoom / current.zoom;
        const { constrain: bound } = geometry.current;
        const previous = bound(current.position, current.zoom);
        return {
          zoom,
          position: bound(
            {
              x: anchor.x - (anchor.x - previous.x) * ratio,
              y: anchor.y - (anchor.y - previous.y) * ratio,
            },
            zoom,
          ),
        };
      });
    }
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, []);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") closeRef.current();
      if (event.key !== "Tab") return;
      const buttons = Array.from(
        dialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", keydown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown);
      previous?.focus();
    };
  }, []);

  const canPan =
    base.width * view.zoom > space.width ||
    base.height * view.zoom > space.height;
  function endDrag() {
    drag.current = null;
    setDragging(false);
  }

  return createPortal(
    <div
      ref={dialog}
      className={styles["image-preview-backdrop"]}
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      aria-describedby="image-preview-hint"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className={styles["image-preview-title"]}>{alt || "图片预览"}</div>
      <button
        ref={closeButton}
        className={styles["image-preview-close"]}
        type="button"
        aria-label="关闭图片预览"
        title="关闭 (Esc)"
        onClick={close}
      >
        <X size={20} />
      </button>
      <div
        ref={stage}
        className={styles["image-preview-stage"]}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div
          className={styles["image-preview-canvas"]}
          data-pannable={canPan}
          data-dragging={dragging}
          style={{
            width: Math.min(base.width * view.zoom, space.width),
            height: Math.min(base.height * view.zoom, space.height),
          }}
          onDoubleClick={(event) => {
            if (view.zoom > 1) reset();
            else {
              const rect = stage.current!.getBoundingClientRect();
              zoomBy(2, {
                x: event.clientX - rect.left - rect.width / 2,
                y: event.clientY - rect.top - rect.height / 2,
              });
            }
          }}
          onPointerDown={(event) => {
            if (event.button !== 0 || !canPan || drag.current) return;
            drag.current = {
              pointerId: event.pointerId,
              start: { x: event.clientX, y: event.clientY },
              position,
            };
            setView((current) => ({ ...current, position }));
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            if (!current || current.pointerId !== event.pointerId) return;
            setView((view) => ({
              ...view,
              position: constrain(
                {
                  x: current.position.x + event.clientX - current.start.x,
                  y: current.position.y + event.clientY - current.start.y,
                },
                view.zoom,
              ),
            }));
          }}
          onPointerUp={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            endDrag();
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        >
          <img
            src={src}
            alt={alt || "业务字段图片"}
            draggable={false}
            onLoad={(event) =>
              setNatural({
                width: event.currentTarget.naturalWidth,
                height: event.currentTarget.naturalHeight,
              })
            }
            style={{
              width: base.width * view.zoom,
              height: base.height * view.zoom,
              transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
            }}
          />
        </div>
      </div>
      <div className={styles["image-preview-controls"]}>
        <div
          className={styles["image-preview-toolbar"]}
          role="group"
          aria-label="图片缩放控制"
        >
          <button
            type="button"
            aria-label="缩小图片"
            title="缩小"
            disabled={view.zoom <= 1}
            onClick={() => zoomBy((view.zoom - 0.25) / view.zoom)}
          >
            <Minus size={18} />
          </button>
          <button
            type="button"
            className={styles["image-preview-scale"]}
            aria-label="重置图片大小"
            title="恢复适应窗口（100%）"
            onClick={reset}
          >
            {Math.round(view.zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="放大图片"
            title="放大"
            disabled={view.zoom >= 5}
            onClick={() => zoomBy((view.zoom + 0.25) / view.zoom)}
          >
            <Plus size={18} />
          </button>
          <span className={styles["image-preview-divider"]} />
          <button
            type="button"
            aria-label="适应窗口"
            title="适应窗口"
            onClick={reset}
          >
            <RotateCcw size={17} />
          </button>
        </div>
        <p id="image-preview-hint" className={styles["image-preview-hint"]}>
          滚轮缩放 · 双击放大 / 还原 · 放大后拖动 · Esc 关闭
        </p>
      </div>
    </div>,
    document.body,
  );
}
