/**
 * art-06 showcase capture — drives the DEV-only ?showcase mode and shoots the
 * asset-critique screenshots the rubric (corpus/wiki/citadel-asset-critique.md)
 * is graded against. Uses system Chrome with WebGPU (the bundled Chromium can't
 * make a device on this box), same as play.mjs.
 *
 * Flips the toggles exposed on window.__citadelShowcase.toggles and captures:
 *   showcase-noon.png     day 0.5, plain
 *   showcase-dusk.png     day 0.72
 *   showcase-night.png    day 0.9 (dusk-lit glow + wash)
 *   showcase-isometry.png noon + diamond/ruler overlay
 *   showcase-fire.png     noon + every building burning
 *
 * Run:  node .claude/skills/playtest-citadel/showcase.mjs
 * Knobs: URL, OUT (default ./citadel-playtest-out).
 */
import { mkdirSync, existsSync as exists, readdirSync as readdir } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

async function resolvePlaywright() {
  try { return await import("playwright"); } catch {}
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const npx = join(home, "AppData/Local/npm-cache/_npx");
  if (exists(npx)) for (const h of readdir(npx)) {
    const p = join(npx, h, "node_modules/playwright/index.js");
    if (exists(p)) return createRequire(pathToFileURL(p))("./index.js");
  }
  throw new Error("Playwright not found. Install once: `npm i -D playwright@1.61.0`.");
}

const BASE = process.env.URL || "http://localhost:5174/";
const URL = BASE + (BASE.includes("?") ? "&" : "?") + "showcase";
const OUT = process.env.OUT || "./citadel-playtest-out";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await resolvePlaywright();
const browser = await pw.chromium.launch({
  channel: "chrome", headless: false,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
page.on("pageerror", (e) => console.log("PAGEERR", String(e)));

await page.goto(URL, { waitUntil: "networkidle" });
// Wait for the showcase handle to appear (renderer booted).
await page.waitForFunction(() => window.__citadelShowcase !== undefined, { timeout: 20000 });
await sleep(1200); // let the atlas bake + first frames settle

async function shoot(name, toggles) {
  await page.evaluate((t) => {
    const h = window.__citadelShowcase;
    Object.assign(h.toggles, t);
  }, toggles);
  await sleep(700); // a few frames at the new toggle state
  await page.screenshot({ path: join(OUT, `showcase-${name}.png`) });
  console.log(`shot showcase-${name}.png`, JSON.stringify(toggles));
}

await shoot("noon", { burning: false, isometry: false, dayFraction: 0.5 });
await shoot("dusk", { burning: false, isometry: false, dayFraction: 0.72 });
await shoot("night", { burning: false, isometry: false, dayFraction: 0.9 });
await shoot("isometry", { burning: false, isometry: true, dayFraction: 0.5 });
await shoot("fire", { burning: true, isometry: false, dayFraction: 0.5 });

console.log("done — captures in", OUT);
await browser.close();
