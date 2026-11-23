// usage: node heap.mjs <url> <outfile.json>   (headless Chromium, sampling heap profile over the bench window)
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const [url, out] = process.argv.slice(2);
const BIN =
  process.env.HOME +
  "/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(
  BIN,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${mkdtempSync(join(tmpdir(), "heap-"))}`,
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
const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result.value;
try {
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("HeapProfiler.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", { source: "requestAnimationFrame(t=>{window.__t0=t})" });
  await send("Page.navigate", { url });
  let started = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 150000) {
    await sleep(50);
    if (!started) {
      const e = await ev("window.__t0===undefined?-1:performance.now()-window.__t0");
      if (e >= 3000) {
        await send("HeapProfiler.startSampling", {
          samplingInterval: 4096,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        });
        started = true;
      }
    } else if (await ev("!!window.__benchResult")) break;
  }
  const { profile } = await send("HeapProfiler.stopSampling");
  const result = JSON.parse(await ev("JSON.stringify(window.__benchResult)"));
  const sites = new Map();
  let total = 0;
  const fmt = (cf) =>
    `${cf.functionName || "(anon)"} ${cf.url
      .replace(/^.*localhost:\d+/, "")
      .replace(/^\/@fs.*game-engine\//, "")
      .replace(/\?.*$/, "")}:${cf.lineNumber + 1}`;
  const walk = (n, par = []) => {
    const cf = n.callFrame;
    if (n.selfSize > 0) {
      const key = cf.url === "" ? `${fmt(cf)} <- ${par.slice(-3).reverse().join(" < ")}` : fmt(cf);
      sites.set(key, (sites.get(key) ?? 0) + n.selfSize);
      total += n.selfSize;
    }
    n.children.forEach((c) => walk(c, [...par, cf.url === "" ? "" : fmt(cf)].filter(Boolean)));
  };
  walk(profile.head);
  const frames = result.frames.displayTicks;
  const ranked = [...sites]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([site, bytes]) => ({ site, bytes, bytesPerFrame: Math.round(bytes / frames) }));
  writeFileSync(
    out,
    JSON.stringify(
      {
        url,
        frames,
        totalBytes: total,
        bytesPerFrame: Math.round(total / frames),
        heapDrops: result.heap.drops,
        counters: result.counters,
        sceneReport: result.sceneReport,
        ranked,
      },
      null,
      2,
    ),
  );
  console.log(`frames ${frames} total ${total} B/frame ${Math.round(total / frames)} drops ${result.heap.drops}`);
} finally {
  ws.close();
  chrome.kill();
}
process.exit(0);
