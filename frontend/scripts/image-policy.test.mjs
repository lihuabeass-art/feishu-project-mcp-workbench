import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

test("desktop CSP allows HTTPS avatars while retaining local and data images", () => {
  const config = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  const directives = Object.fromEntries(config.app.security.csp.split(";").map((directive) => {
    const [name, ...sources] = directive.trim().split(/\s+/);
    return [name, sources];
  }));
  assert.deepEqual(directives["img-src"], ["'self'", "data:", "https:"]);
  assert.deepEqual(directives["connect-src"], ["ipc:", "http://ipc.localhost"]);
});
