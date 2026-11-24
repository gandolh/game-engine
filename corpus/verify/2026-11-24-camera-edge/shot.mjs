// usage: [HORIZONTAL=1] node shot.mjs <url> <out-prefix> <farm|citadel|hollow>
// HORIZONTAL=1 / VERTICAL=1 (Hollow) drag one way only.
// Drags hard toward a corner and shoots, then drags back.
// Headless Chromium over CDP (adapted from ../2026-11-23-hollow-culling/shot.mjs). Starts seed 42, zooms the orbit camera in,
// then takes four cropped frames 300 ms apart at 1x, at 8x and paused, so the walkers legs can be compared frame to frame.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, prefix, game] = process.argv.slice(2);
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
  await sleep(game === "hollow" ? 4000 : 8000);
  if (game === "hollow") {
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
    await sleep(8000);
  }
  if (game !== "hollow") {
    await send("Runtime.evaluate", {
      expression: `[...document.querySelectorAll("button")].find((b) => /^(Start|New game|Play)/i.test(b.textContent.trim()))?.click()`,
    });
    await sleep(6000);
  }
  // Left drag for Farm, right drag for Citadel, shift + left drag for Hollow.
  const button = game === "citadel" ? "right" : "left";
  const modifiers = game === "hollow" ? 8 : 0;
  const mask = button === "right" ? 2 : 1;
  const mouse = (type, x, y) =>
    send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button,
      buttons: type === "mouseReleased" ? 0 : mask,
      clickCount: 1,
      modifiers,
    });
  if (game === "citadel") {
    // The in-canvas ruleset dialog: pick "Cozy".
    for (const type of ["mousePressed", "mouseReleased"])
      await send("Input.dispatchMouseEvent", {
        type,
        x: 438,
        y: 339,
        button: "left",
        buttons: type === "mousePressed" ? 1 : 0,
        clickCount: 1,
      });
    await sleep(2000);
  }
  const drag = async (x0, y0, x1, y1) => {
    await mouse("mousePressed", x0, y0);
    for (let k = 1; k <= 10; k++) await mouse("mouseMoved", x0 + ((x1 - x0) * k) / 10, y0 + ((y1 - y0) * k) / 10);
    await mouse("mouseReleased", x1, y1);
  };
  // Dragging right/down moves the view up-left; do it many times toward the top-left corner.
  // Citadel's and Hollow's panels cover the top-left, so their drags start on the open canvas.
  for (let k = 0; k < 25; k++)
    await (game === "citadel"
      ? drag(150, 250, 1100, 600)
      : game === "hollow"
        ? process.env.HORIZONTAL
          ? drag(420, 400, 1250, 400)
          : process.env.VERTICAL
            ? drag(800, 130, 800, 780)
            : drag(420, 130, 1250, 780)
        : drag(100, 100, 1100, 700));
  await sleep(1500);
  const a = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${prefix}-corner.png`, Buffer.from(a.data, "base64"));
  // And back: one short drag the other way must move the view at once.
  await drag(600, 400, 500, 350);
  await sleep(800);
  const b = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${prefix}-back.png`, Buffer.from(b.data, "base64"));
  console.log("done");
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
