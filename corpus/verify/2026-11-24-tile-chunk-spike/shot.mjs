// usage: node shot.mjs <out-prefix> [query]   e.g. node shot.mjs ./baked   or   node shot.mjs ./chunks tilechunks
// Needs Farm's dev server on :5173 and its sim server on :8787 (npm run dev).
// Headless Chromium over CDP (adapted from ../2026-11-24-camera-edge/shot.mjs). Starts a run from the home
// screen, pauses it, then sets the camera through the client's own camera module and shoots three poses:
// the default zoom at the world centre, the default zoom on a coast (sand shore bands and water speckles),
// and the widest zoom. Also writes <out-prefix>-longtasks.json, the page's long tasks (the bake is one).
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [prefix, query = ""] = process.argv.slice(2);
const url = `http://localhost:5173/${query === "" ? "" : `?${query}`}`;
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9335;
const POSES = [
  { name: "default", zoom: 3, x: 0, y: 0 },
  { name: "coast", zoom: 3, x: 1144, y: 40 },
  { name: "widest", zoom: 0.5, x: 0, y: 0 },
];

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
// Stop Chromium however the run ends, and wait for it to go, so no browser outlives the script.
const stopChrome = async () => {
  if (chrome.exitCode !== null) return;
  const gone = new Promise((r) => chrome.once("exit", r));
  chrome.kill();
  await Promise.race([gone, sleep(5000)]);
  if (chrome.exitCode === null) chrome.kill("SIGKILL");
};
process.on("uncaughtException", async (err) => {
  console.error(err);
  await stopChrome();
  process.exit(1);
});
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
  try {
    const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    wsUrl = l.find((t) => t.type === "page")?.webSocketDebuggerUrl;
  } catch {}
  if (!wsUrl) await sleep(500);
}
if (!wsUrl) {
  await stopChrome();
  throw new Error(`no page on :${PORT}`);
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
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
};
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `window.__longTasks = [];
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push({ start: Math.round(e.startTime), ms: Math.round(e.duration) }); }).observe({ type: "longtask", buffered: true });`,
  });
  await send("Page.navigate", { url });
  await sleep(8000);
  await evaluate(
    `[...document.querySelectorAll("button")].find((b) => /^(Start|New game|Play)/i.test(b.textContent.trim()))?.click()`,
  );
  await sleep(12000);
  // Pause the run, so both sides show the sim at about the same tick.
  await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "p" }))`);
  await sleep(1000);
  for (const pose of POSES) {
    await evaluate(`(async () => {
      const cam = await import("/src/main/camera.ts");
      cam.setFocusedFarmerId(null);
      cam.setRecenteringOnPip(false);
      cam.setPanOffset({ x: ${pose.x}, y: ${pose.y} });
      cam.setZoom(${pose.zoom});
      cam._camera.setZoom(${pose.zoom});
    })()`);
    await sleep(2500);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${prefix}-${pose.name}.png`, Buffer.from(shot.data, "base64"));
  }
  const longTasks = await evaluate(`JSON.stringify(window.__longTasks)`);
  writeFileSync(`${prefix}-longtasks.json`, longTasks + "\n");
  console.log("done");
} finally {
  ws.close();
  await stopChrome();
}
process.exit(0);
