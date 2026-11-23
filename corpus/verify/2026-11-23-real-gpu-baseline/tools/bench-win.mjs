// Runs ?bench scenes in a throwaway Windows Chrome profile on the real GPU and prints each result.
// Run with Windows node.exe: node bench-win.mjs '<runs json>'
// runs: [{ name, url, frame?: true, phone?: true }]
// Prints one line per run: RESULT <name> <json>  (or FAIL <name> <reason>)
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9239;
const RESULT_TIMEOUT_MS = 120_000;
const runs = JSON.parse(process.argv[2]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profileDir = mkdtempSync(join(tmpdir(), "ge-bench-"));
const chrome = spawn(
  CHROME,
  [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${PORT}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--start-maximized",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function browserWs() {
  for (let i = 0; i < 60; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      return v.webSocketDebuggerUrl;
    } catch {
      await sleep(500);
    }
  }
  throw new Error("chrome did not open its debugging port");
}

const ws = new WebSocket(await browserWs());
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let nextId = 1;
const pending = new Map();
ws.addEventListener("message", (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

const targets = await send("Target.getTargets");
const page = targets.targetInfos.find((t) => t.type === "page");
const { sessionId } = await send("Target.attachToTarget", { targetId: page.targetId, flatten: true });
const s = (method, params) => send(method, params, sessionId);
await s("Page.enable");
await s("Runtime.enable");

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36";

for (const run of runs) {
  try {
    await s("Page.navigate", { url: "about:blank" });
    await sleep(2000);
    if (run.phone) {
      // Landscape Pixel 7: the games need a wide viewport. The GPU stays the laptop's.
      await s("Emulation.setDeviceMetricsOverride", {
        width: 915,
        height: 412,
        deviceScaleFactor: 2.625,
        mobile: true,
      });
      await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
      await s("Emulation.setUserAgentOverride", { userAgent: PHONE_UA, platform: "Android" });
      await s("Emulation.setCPUThrottlingRate", { rate: 4 });
    } else {
      await s("Emulation.clearDeviceMetricsOverride");
      await s("Emulation.setTouchEmulationEnabled", { enabled: false });
      await s("Emulation.setUserAgentOverride", { userAgent: "" });
      await s("Emulation.setCPUThrottlingRate", { rate: 1 });
    }
    await s("Page.bringToFront");
    await s("Page.navigate", { url: run.url });
    if (run.cpuProfile) {
      // Profile the sampled window only: past load and the 3 s warm-up.
      await sleep(run.profileDelayMs ?? 8000);
      await s("Profiler.enable");
      await s("Profiler.setSamplingInterval", { interval: 200 });
      await s("Profiler.start");
    }
    const expr = run.frame
      ? "(() => { const f = document.querySelector('iframe'); const r = f && f.contentWindow && f.contentWindow.__benchResult; return r ? JSON.stringify({ ...r, frameRect: { width: f.clientWidth, height: f.clientHeight }, topWindow: { innerWidth, innerHeight, dpr: devicePixelRatio } }) : null; })()"
      : "(() => { const r = window.__benchResult; return r ? JSON.stringify({ ...r, topWindow: { innerWidth, innerHeight, dpr: devicePixelRatio, visibility: document.visibilityState } }) : null; })()";
    const start = Date.now();
    let out = null;
    while (Date.now() - start < RESULT_TIMEOUT_MS) {
      await sleep(2000);
      const r = await s("Runtime.evaluate", { expression: expr, returnByValue: true });
      if (r.result && typeof r.result.value === "string") {
        out = r.result.value;
        break;
      }
    }
    if (run.cpuProfile) {
      const { profile } = await s("Profiler.stop");
      console.log(`PROFILE ${run.name} ${JSON.stringify(profile)}`);
    }
    if (out) console.log(`RESULT ${run.name} ${out}`);
    else {
      const st = await s("Runtime.evaluate", {
        expression:
          "JSON.stringify({ visibility: document.visibilityState, focus: document.hasFocus(), canvases: document.querySelectorAll('canvas').length })",
        returnByValue: true,
      });
      console.log(
        `FAIL ${run.name} no __benchResult after ${RESULT_TIMEOUT_MS} ms; page ${st.result && st.result.value}`,
      );
    }
  } catch (e) {
    console.log(`FAIL ${run.name} ${e.message}`);
  }
}

try {
  await send("Browser.close");
} catch {}
await sleep(1500);
try {
  chrome.kill();
} catch {}
try {
  rmSync(profileDir, { recursive: true, force: true });
} catch {}
process.exit(0);
