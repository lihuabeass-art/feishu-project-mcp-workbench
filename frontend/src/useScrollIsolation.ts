import { useCallback, type RefObject } from "react";
import "./scrollIsolation.css";

function canScroll(
  boundary: HTMLElement,
  target: EventTarget | null,
  deltaX: number,
  deltaY: number,
) {
  // 只允许弹层内能消费本次方向的滚动容器接收浏览器默认滚动。
  for (
    let node = target instanceof Element ? target : null;
    node && boundary.contains(node);
    node = node.parentElement
  ) {
    const style = window.getComputedStyle(node);
    if (
      /^(auto|scroll)$/.test(style.overflowY) &&
      ((deltaY < 0 && node.scrollTop > 0) ||
        (deltaY > 0 && node.scrollTop + node.clientHeight < node.scrollHeight))
    )
      return true;
    if (
      /^(auto|scroll)$/.test(style.overflowX) &&
      ((deltaX < 0 && node.scrollLeft > 0) ||
        (deltaX > 0 && node.scrollLeft + node.clientWidth < node.scrollWidth))
    )
      return true;
  }
  return false;
}

export function useScrollIsolation<T extends HTMLElement = HTMLDivElement>(
  ref?: RefObject<T | null>,
) {
  return useCallback(
    (node: T | null) => {
      if (ref) ref.current = node;
      if (!node) return;
      const boundary = node;
      function wheel(event: WheelEvent) {
        event.stopPropagation();
        // 保留浏览器缩放；普通滚轮与触控板滚动在边界处禁止继续穿透。
        if (event.ctrlKey) return;
        if (!canScroll(boundary, event.target, event.deltaX, event.deltaY))
          event.preventDefault();
      }
      // React 的委托滚轮监听可能为 passive，须在弹层上使用原生监听。
      boundary.addEventListener("wheel", wheel, { passive: false });
      return () => {
        boundary.removeEventListener("wheel", wheel);
        if (ref?.current === boundary) ref.current = null;
      };
    },
    [ref],
  );
}
