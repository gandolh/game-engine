// Smoke test for @engine/ui, installed from its tarball alongside @engine/core (ui depends on
// core@0.1.0 and must resolve it from the sibling file: install, not the registry).
//
// Only import the /widget, /layout, /theme subpaths in plain Node. Do NOT import the package
// root or /render here: /render pulls in `?raw` .wgsl shader imports, which are a Vite/bundler
// convention (raw-text loader) that plain Node's ESM loader does not understand — those need a
// bundler, not a Node smoke. /a11y needs a DOM (jsdom) to mirror nodes into; skipped here rather
// than pulling in a jsdom dependency just for this fixture.

import assert from "node:assert/strict";
import { panel, label, button } from "@engine/ui/widget";
import { computeLayout } from "@engine/ui/layout";
import { DEFAULT_THEME } from "@engine/ui/theme";

let clicked = false;
const btn = button("Click me", { onActivate: () => (clicked = true) });
const lbl = label("Hello from the tarball");
const root = panel({}, [lbl, btn]);

computeLayout(root, 0, 0, DEFAULT_THEME);

assert.ok(root.rect.width > 0 && root.rect.height > 0, "panel rect should be sized by layout");
assert.ok(lbl.rect.width > 0 && lbl.rect.height > 0, "label rect should be sized by layout");
assert.ok(btn.rect.width > 0 && btn.rect.height > 0, "button rect should be sized by layout");

btn.onActivate();
assert.equal(clicked, true, "onActivate handle should be callable");

console.log(
  "[ui] OK — panel/label/button + computeLayout wrote rects:",
  JSON.stringify({ panel: root.rect, label: lbl.rect, button: btn.rect }),
);
