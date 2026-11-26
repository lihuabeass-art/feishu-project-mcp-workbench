// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const cssFiles = [
  "theme.css",
  "styles.css",
  "creation.css",
  "dateRangePicker.css",
  "CompactTypeTabs.css",
  "FilterSchemeMenu.css",
  "schedule.css",
  "scheduleViews.css",
  "ImagePreview.module.css",
];

const sheet = document.createElement("style");
afterEach(() => {
  sheet.remove();
  document.body.replaceChildren();
});

it("所有下拉入口高于抽屉和弹窗遮罩，图片预览仍覆盖下拉", () => {
  // 使用真实样式级联，捕获组件重新引入较低 z-index 的回归。
  sheet.textContent = cssFiles
    .map((path) =>
      readFileSync(new URL(path, import.meta.url), "utf8").replace(
        /^@import.*$/gm,
        "",
      ),
    )
    .join("\n");
  document.head.append(sheet);
  function layer(className: string) {
    const node = document.createElement("div");
    node.className = className;
    document.body.append(node);
    const value = getComputedStyle(node).zIndex;
    const variable = /^var\((--[\w-]+)\)$/.exec(value);
    // jsdom 不解析 CSS 自定义属性；浏览器由相同的根变量计算。
    const resolved = Number(
      variable
        ? getComputedStyle(document.documentElement).getPropertyValue(
            variable[1],
          )
        : value,
    );
    expect(Number.isFinite(resolved) && resolved > 0, className).toBe(true);
    return resolved;
  }
  const backdrops = [
    "creation-backdrop",
    "schedule-dialog-backdrop",
    "filter-scheme-backdrop",
    "schedule-view-backdrop",
  ].map(layer);
  for (const menu of [
    "creation-lookup-menu",
    "select-menu",
    "date-range-calendar",
    "theme-menu",
    "list-mode-type-menu",
    "filter-scheme-menu",
  ]) {
    const menuLayer = layer(menu);
    for (const backdrop of backdrops)
      expect(menuLayer, menu).toBeGreaterThan(backdrop);
    expect(menuLayer, menu).toBeLessThan(layer("image-preview-backdrop"));
  }
});
