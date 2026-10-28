// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImagePreview } from "./ImagePreview";

let resize: () => void;
let space: { width: number; height: number };
beforeEach(() => {
  space = { width: 800, height: 600 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function () {
      return {
        ...space,
        x: 24,
        y: 72,
        left: 24,
        top: 72,
        right: 24 + space.width,
        bottom: 72 + space.height,
        toJSON() {},
      };
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("PointerEvent", MouseEvent);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(width: number, height: number) {
  const close = vi.fn();
  render(
    <ImagePreview src="data:image/png;base64,test" alt="截图" close={close} />,
  );
  const image = screen.getByAltText("截图") as HTMLImageElement;
  Object.defineProperties(image, {
    naturalWidth: { value: width },
    naturalHeight: { value: height },
  });
  fireEvent.load(image);
  const frame = image.parentElement!;
  const stage = frame.parentElement!;
  return { image, frame, stage, close };
}

it.each([
  [320, 180, 320, 180],
  [2400, 1200, 800, 400],
  [600, 3000, 120, 600],
])(
  "图片 %i×%i 的预览紧贴图片并等比限制在窗口内",
  (width, height, expectedWidth, expectedHeight) => {
    const { image, frame } = open(width, height);
    expect(frame.style.width).toBe(`${expectedWidth}px`);
    expect(frame.style.height).toBe(`${expectedHeight}px`);
    expect(image.style.width).toBe(frame.style.width);
    expect(image.style.height).toBe(frame.style.height);
  },
);

it("小图放大时边框随图片增长，不留下固定画布", () => {
  const { frame } = open(200, 100);
  fireEvent.click(screen.getByRole("button", { name: "放大图片" }));
  expect(frame.style.width).toBe("250px");
  expect(frame.style.height).toBe("125px");
});

it("滚轮阻止默认滚动，并保持鼠标下的图片位置，缩小到适应窗口即止", () => {
  const { image, stage, frame } = open(800, 600);
  const wheel = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    clientX: 624,
    clientY: 372,
    deltaY: -100,
  });
  act(() => stage.dispatchEvent(wheel));
  expect(wheel.defaultPrevented).toBe(true);
  const width = Number.parseFloat(image.style.width);
  const x = Number(image.style.transform.match(/-50% \+ ([-\d.]+)px/)![1]);
  // The image point 200px to the right of centre stays at the same screen coordinate.
  expect((200 * width) / 800 + x).toBeCloseTo(200);
  expect(frame.style.width).toBe("800px");
  expect(screen.getByRole("button", { name: "重置图片大小" }).textContent).toBe(
    "122%",
  );
  for (let i = 0; i < 5; i++) fireEvent.wheel(stage, { deltaY: 100 });
  expect(image.style.width).toBe("800px");
  expect(image.style.transform).toContain("-50% + 0px");
  expect(
    (screen.getByRole("button", { name: "缩小图片" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it("放大图片可拖动，拖动不越界，失去捕获后停止，双击还原", () => {
  const { image, frame } = open(800, 600);
  frame.setPointerCapture = vi.fn();
  frame.releasePointerCapture = vi.fn();
  fireEvent.doubleClick(frame, { clientX: 424, clientY: 372 });
  fireEvent.pointerDown(frame, { button: 0, clientX: 424, clientY: 372 });
  fireEvent.pointerMove(frame, { clientX: 10000, clientY: 10000 });
  expect(image.style.transform).toBe(
    "translate(calc(-50% + 400px), calc(-50% + 300px))",
  );
  fireEvent.lostPointerCapture(frame);
  fireEvent.pointerMove(frame, { clientX: -10000, clientY: -10000 });
  expect(image.style.transform).toContain("-50% + 400px");
  fireEvent.doubleClick(frame);
  expect(image.style.width).toBe("800px");
  expect(image.style.transform).toContain("-50% + 0px");
});

it("窗口缩小时重新适配长图，恢复适应窗口会清除缩放", () => {
  const { image, frame } = open(600, 3000);
  space = { width: 400, height: 300 };
  act(() => resize());
  expect(frame.style.width).toBe("60px");
  expect(frame.style.height).toBe("300px");
  fireEvent.click(screen.getByRole("button", { name: "放大图片" }));
  fireEvent.click(screen.getByRole("button", { name: "适应窗口" }));
  expect(image.style.height).toBe("300px");
});

it("Tab 循环跳过禁用按钮，关闭恢复滚动，背景点击能关闭", async () => {
  const user = userEvent.setup();
  document.body.style.overflow = "auto";
  const { close, stage } = open(200, 100);
  await user.tab({ shift: true });
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "适应窗口" }),
  );
  await user.tab();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "关闭图片预览" }),
  );
  fireEvent.click(stage);
  expect(close).toHaveBeenCalledOnce();
  cleanup();
  expect(document.body.style.overflow).toBe("auto");
  document.body.style.overflow = "";
});
