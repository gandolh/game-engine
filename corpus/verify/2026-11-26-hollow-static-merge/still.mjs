// usage: node still.mjs <url> <out.png> [ticks]
// One frame of Hollow at a sim tick that does not depend on timing, so a before and an after image can be compared
// pixel by pixel. Headless Chromium over CDP, as ../2026-11-23-hollow-culling/shot.mjs. It starts seed 42 and pauses
// it in the same task, so the worker never runs a tick on its own, then presses Step `ticks` times (default 300), one
// press every 80 ms so the render sees every snapshot (homes freeze where they are first drawn). It waits for the
// interpolation to settle and takes one PNG at the start pose. It prints the tick the HUD shows.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out, ticksArg] = process.argv.slice(2);
const TICKS = Number(ticksArg ?? 300);
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  BIN,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "still-"))}`,
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
  // Seed 42, Start, and Pause in one task: the worker reads "init" then "setPaused" before its pump first fires.
  await send("Runtime.evaluate", {
    expression: `(() => {
      const seed = document.querySelector("input");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(seed, "42");
      seed.dispatchEvent(new Event("input", { bubbles: true }));
      seed.dispatchEvent(new Event("change", { bubbles: true }));
      const button = (label) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === label);
      button("Start").click();
      button("Pause").click();
    })()`,
  });
  await sleep(2000);
  await send("Runtime.evaluate", {
    awaitPromise: true,
    expression: `(async () => {
      const step = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Step");
      for (let i = 0; i < ${TICKS}; i++) {
        step.click();
        await new Promise((r) => setTimeout(r, 80));
      }
    })()`,
  });
  await sleep(4000);
  const { result } = await send("Runtime.evaluate", {
    expression: `(document.body.innerText.match(/tick\\s+(\\d+)/) ?? [])[1] ?? "?"`,
  });
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(data, "base64"));
  console.log(`${out} at tick ${result.value}`);
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
