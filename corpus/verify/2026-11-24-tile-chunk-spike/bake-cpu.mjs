// usage: node bake-cpu.mjs <out.json> [query]   e.g. node bake-cpu.mjs ./baked-cpu.json   or   ... tilechunks
// Needs Farm's dev server on :5173 and its sim server on :8787 (npm run dev).
// Headless Chromium over CDP (as ./shot.mjs). Records a CPU profile (100 µs samples) from page load to 12 s
// after Start, and sums the inclusive CPU ms under the functions that build the ground: the baked path's
// renderer.bakeStaticLayer, the chunk path's buildTileChunkDecor and renderer.bakeTileChunks, and the
// water pattern and depth mask both paths share.
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [out, query = ""] = process.argv.slice(2);
const url = `http://localhost:5173/${query === "" ? "" : `?${query}`}`;
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9337;
const TARGETS = [
  { name: "bakeStaticLayer", fn: "bakeStaticLayer", file: "webgl2/renderer.ts" },
  { name: "buildTileChunkDecor", fn: "buildTileChunkDecor", file: "main/static-layer.ts" },
  { name: "bakeTileChunks", fn: "bakeTileChunks", file: "webgl2/renderer.ts" },
  { name: "bakeWaterPattern", fn: "bakeWaterPattern", file: "webgl2/renderer.ts" },
  { name: "setWaterDepthMask", fn: "setWaterDepthMask", file: "webgl2/renderer.ts" },
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
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 100 });
  await send("Profiler.start");
  await send("Page.navigate", { url });
  await sleep(8000);
  await evaluate(
    `[...document.querySelectorAll("button")].find((b) => /^(Start|New game|Play)/i.test(b.textContent.trim()))?.click()`,
  );
  await sleep(12000);
  const { profile } = await send("Profiler.stop");
  // Inclusive CPU ms under each target: a sample counts for a target when any frame above it is the target.
  const parent = new Map();
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const totals = Object.fromEntries(TARGETS.map((t) => [t.name, 0]));
  for (let i = 0; i < profile.samples.length; i++) {
    const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const hit = new Set();
    for (let id = profile.samples[i]; id !== undefined; id = parent.get(id)) {
      const f = byId.get(id).callFrame;
      for (const t of TARGETS) if (f.functionName === t.fn && f.url.includes(t.file)) hit.add(t.name);
    }
    for (const name of hit) totals[name] += ms;
  }
  for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 10) / 10;
  writeFileSync(out, JSON.stringify({ url, totals }, null, 2) + "\n");
  console.log(JSON.stringify(totals));
} finally {
  ws.close();
  await stopChrome();
}
process.exit(0);
