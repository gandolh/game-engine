import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/package.json");
const { TraceMap, originalPositionFor } = require("@jridgewell/trace-mapping");
// argv: <file.cpuprofile> <fps> [<game client dist folder>, default Farm's]
const [profPath, fps, dist] = [process.argv[2], Number(process.argv[3]), process.argv[4] ?? "games/farm/client/dist"];
const prof = JSON.parse(readFileSync(profPath, "utf8"));
const byId = new Map(prof.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of prof.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
const self = new Map();
for (let i = 0; i < prof.samples.length; i++) {
  const dt = prof.timeDeltas[i + 1] ?? 0;
  self.set(prof.samples[i], (self.get(prof.samples[i]) ?? 0) + dt);
}
const maps = new Map();
function nameOf(cf) {
  const m = cf.url.match(/\/assets\/([^/?]+\.js)$/);
  if (!m) return `${cf.functionName || "(anon)"} [${cf.url ? "ext" : "native"}]`;
  const mp = `${dist}/assets/${m[1]}.map`;
  if (!maps.has(mp)) maps.set(mp, existsSync(mp) ? new TraceMap(readFileSync(mp, "utf8")) : null);
  const tm = maps.get(mp);
  if (!tm) return `${cf.functionName} [${m[1]}]`;
  const o = originalPositionFor(tm, { line: cf.lineNumber + 1, column: cf.columnNumber });
  const src = (o.source ?? "?").replace(/^.*?(engine|games)\//, "$1/");
  return `${o.name ?? cf.functionName ?? "(anon)"} ${src}:${o.line}`;
}
const keyCache = new Map();
const key = (id) => {
  if (!keyCache.has(id)) keyCache.set(id, nameOf(byId.get(id).callFrame));
  return keyCache.get(id);
};
const incl = new Map(),
  selfBy = new Map();
for (const [id, t] of self) {
  selfBy.set(key(id), (selfBy.get(key(id)) ?? 0) + t);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = key(cur);
    if (seen.has(k)) continue;
    seen.add(k);
    incl.set(k, (incl.get(k) ?? 0) + t);
  }
}
const durS = (prof.endTime - prof.startTime) / 1e6;
const frames = durS * fps;
console.log(`profile ${durS.toFixed(1)} s, ~${Math.round(frames)} frames at ${fps} fps; ms per frame below`);
const show = (m, title, n, filter = () => true) => {
  console.log(`-- ${title}`);
  [...m]
    .filter(([k]) => filter(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .forEach(([k, t]) => console.log(`${(t / 1000 / frames).toFixed(3).padStart(8)}  ${k}`));
};
show(
  incl,
  "inclusive, top",
  40,
  (k) => !k.startsWith("(root)") && !k.startsWith("(program)") && !k.startsWith("(idle)"),
);
show(selfBy, "self, top", 25);
show(incl, "named targets (inclusive)", 30, (k) =>
  /sort|compareSprite|ghost|OverlayLight|texImage2D|endFrame|draw |paint|createRadialGradient|fillRect|getImageData|GC|garbage/i.test(
    k,
  ),
);
