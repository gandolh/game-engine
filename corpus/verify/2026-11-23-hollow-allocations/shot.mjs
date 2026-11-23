// usage: node shot.mjs <url> <out-prefix>
// Headless Chromium over CDP (as ../2026-11-23-allocations/heap.mjs does). Loads Hollow without ?bench, starts seed 42,
// waits for the town to draw, then takes one PNG at the start pose and one after each fixed drag of the orbit
// camera, so before and after frame the same views. A drag of dx pixels turns the camera by a fixed yaw.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, prefix] = process.argv.slice(2);
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9334;
const DRAGS = [0, 250, 250, 250]; // dx pixels applied before each shot (cumulative)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  BIN,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "shot-"))}`,
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
    "--window-size=1280,800",
    "about:blank",
  ],
  { stdio: "ignore" },
);
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(500);
}
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 1;
const pend = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) {
    const p = pend.get(m.id);
    pend.delete(m.id);
    m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const i = id++;
    pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.navigate", { url });
  await sleep(4000);
  // The founding form: a fixed seed, then Start (the bench skips this form; a plain load does not).
  await send("Runtime.evaluate", {
    expression: `(() => {
      const seed = document.querySelector("input");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(seed, "42");
      seed.dispatchEvent(new Event("input", { bubbles: true }));
      seed.dispatchEvent(new Event("change", { bubbles: true }));
      [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Start").click();
    })()`,
  });
  await sleep(10000);
  const mouse = (type, x, y) =>
    send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
    });
  for (let n = 0; n < DRAGS.length; n++) {
    const dx = DRAGS[n];
    if (dx > 0) {
      // Drag across the canvas centre in small steps, well clear of the side panels.
      let x = 600;
      await mouse("mousePressed", x, 400);
      for (let s = 1; s <= 10; s++) await mouse("mouseMoved", (x = 600 + (dx * s) / 10), 400);
      await mouse("mouseReleased", x, 400);
      await sleep(1500);
    }
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${prefix}-${n}.png`, Buffer.from(data, "base64"));
    console.log(`${prefix}-${n}.png`);
  }
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
