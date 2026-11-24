// usage: node shot.mjs <url> <out-prefix>
// Headless Chromium over CDP (adapted from ../2026-11-23-hollow-culling/shot.mjs). Starts seed 42, zooms the orbit camera in,
// then takes four cropped frames 300 ms apart at 1x, at 8x and paused, so the walkers legs can be compared frame to frame.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, prefix] = process.argv.slice(2);
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9334;

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
  // Zoom the orbit camera in so the walkers are big enough to read their legs.
  for (let k = 0; k < 8; k++) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: 640, y: 400, deltaX: 0, deltaY: -240 });
    await sleep(100);
  }
  await sleep(1000);
  const click = (label) =>
    send("Runtime.evaluate", {
      expression: `[...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)}).click()`,
    });
  const clip = { x: 340, y: 150, width: 600, height: 450, scale: 1 };
  // mode, buttons to press first, frames, gap between frames in ms
  const MODES = [
    ["1x", ["1x"], 4, 300],
    ["8x", ["8x"], 4, 300],
    ["paused", ["Pause"], 4, 300],
  ];
  for (const [name, presses, frames, gap] of MODES) {
    for (const p of presses) await click(p);
    await sleep(1500);
    for (let n = 0; n < frames; n++) {
      const { data } = await send("Page.captureScreenshot", { format: "png", clip });
      writeFileSync(`${prefix}-${name}-${n}.png`, Buffer.from(data, "base64"));
      console.log(`${prefix}-${name}-${n}.png`);
      await sleep(gap);
    }
  }
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
