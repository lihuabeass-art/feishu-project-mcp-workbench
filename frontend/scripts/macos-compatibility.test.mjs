import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import postcss from "postcss";

test("旧版 WebKit 对变量颜色混合的每项声明都有能力检测回退", () => {
  for (const file of ["schedule.css", "CreationSelect.css", "creation.css", "MarkdownClipboard.css", "styles.css"]) {
    const css = postcss.parse(readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"));
    const fallback = new Map();
    css.walkAtRules("supports", (rule) => {
      if (rule.params !== "not (color: color-mix(in srgb, red, blue))") return;
      rule.walkRules((entry) => {
        for (const selector of entry.selectors) {
          const properties = fallback.get(selector) ?? new Set();
          entry.walkDecls((declaration) => properties.add(declaration.prop));
          fallback.set(selector, properties);
        }
      });
    });
    css.walkDecls((declaration) => {
      if (!declaration.value.includes("color-mix(") || declaration.prop === "--schedule-sheen") return;
      const selector = declaration.parent.selector;
      const properties = fallback.get(selector);
      assert.ok(properties, `${file}: ${selector} 缺少兼容回退`);
      const covered = properties.has(declaration.prop) ||
        (declaration.prop === "border-color" && properties.has("border"));
      assert.ok(covered, `${file}: ${selector} 缺少 ${declaration.prop} 回退`);
      assert.ok(declaration.source.start.offset < css.last.source.start.offset, `${file}: 回退必须位于原规则之后`);
    });
  }
});
