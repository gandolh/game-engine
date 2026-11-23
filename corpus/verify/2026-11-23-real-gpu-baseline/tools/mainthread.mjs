// Main-thread busy ms per frame, and the worker message handler's inclusive ms per frame.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");
const [profPath, resultPath, dist] = process.argv.slice(2);
const p = JSON.parse(readFileSync(profPath, "utf8"));
const r = JSON.parse(readFileSync(resultPath, "utf8"));
const byId = new Map(p.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const maps = new Map();
const nm = (cf) => {
  const m = cf.url.match(/\/assets\/([^/?]+\.js)$/);
  if (!m) return cf.functionName || "(anon)";
  const mp = `${dist}/assets/${m[1]}.map`;
  if (!maps.has(mp)) maps.set(mp, new TraceMap(readFileSync(mp, "utf8")));
  const o = originalPositionFor(maps.get(mp), { line: cf.lineNumber + 1, column: cf.columnNumber });
  return `${o.name ?? cf.functionName ?? "(anon)"} ${(o.source ?? "").split("/").slice(-2).join("/")}:${o.line}`;
};
const durS = (p.endTime - p.startTime) / 1e6;
const fps = r.frames.interval.fps;
const frames = durS * fps;
let idle = 0,
  total = 0;
const incl = new Map(),
  rootChild = new Map();
for (let i = 0; i < p.samples.length; i++) {
  const dt = (p.timeDeltas[i + 1] ?? 0) / 1000;
  total += dt;
  const leaf = byId.get(p.samples[i]).callFrame.functionName;
  if (leaf === "(idle)") {
    idle += dt;
    continue;
  }
  const seen = new Set();
  let top = null;
  for (let c = p.samples[i]; c !== undefined; c = parent.get(c)) {
    const k = nm(byId.get(c).callFrame);
    if (k !== "(root)") top = k;
    if (seen.has(k)) continue;
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + dt);
  }
  rootChild.set(top, (rootChild.get(top) ?? 0) + dt);
}
console.log(
  `${resultPath.split("/").pop()}: ${durS.toFixed(1)} s at ${fps.toFixed(0)} fps; main thread busy ${((total - idle) / frames).toFixed(2)} ms per frame`,
);
console.log(
  "  top-level tasks (ms per frame):",
  [...rootChild]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k} ${(v / frames).toFixed(2)}`)
    .join(" | "),
);
console.log(
  "  message-related (inclusive ms per frame):",
  [...incl]
    .filter(([k]) => /message|onmessage|data|deserial|ingest|snapshot|chronicle|ingestEvents/i.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, v]) => `${k} ${(v / frames).toFixed(3)}`)
    .join(" | "),
);
