// Summarize bench results: node summarize.mjs <file.json>...
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const r2 = (x) => (typeof x === "number" ? Math.round(x * 100) / 100 : x);
const pct = (x) => (typeof x === "number" ? `${Math.round(x * 10000) / 100}%` : x);

for (const f of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(f, "utf8"));
  const iv = j.frames.interval;
  const heap = Array.isArray(j.heap?.samples) ? j.heap.samples : [];
  let maxGap = 0;
  for (let i = 1; i < heap.length; i++) maxGap = Math.max(maxGap, heap[i].tMs - heap[i - 1].tMs);
  const excessMs = (iv.mean - iv.p50) * iv.samples;
  const heapMB = heap.map((h) => h.usedBytes / 1e6);
  console.log(`== ${basename(f)}  scene=${j.scene ?? "NONE"}`);
  console.log(
    `   renderer=${j.device.renderer.slice(0, 40)}  canvas=${j.device.canvas.width}x${j.device.canvas.height} dpr=${j.device.dpr}` +
      (j.frameRect ? ` frame=${j.frameRect.width}x${j.frameRect.height}` : "") +
      (j.topWindow ? ` top=${j.topWindow.innerWidth}x${j.topWindow.innerHeight}@${r2(j.topWindow.dpr)}` : ""),
  );
  console.log(
    `   duration=${r2(j.frames.durationMs)}ms ticks=${j.frames.displayTicks}  interval p50=${r2(iv.p50)} p95=${r2(iv.p95)} p99=${r2(iv.p99)} >16.7=${pct(iv.over16_7)} >33.3=${pct(iv.over33_3)} fps=${r2(iv.fps)}  excessOverP50=${Math.round(excessMs)}ms`,
  );
  console.log(
    `   drawn frames=${j.frames.drawn.frames} cpu mean=${r2(j.frames.drawn.meanMs)} p95=${r2(j.frames.drawn.p95Ms)} fps=${r2(j.frames.drawn.fps)}`,
  );
  const g = j.gpu;
  console.log(
    typeof g === "object"
      ? `   gpu mean=${r2(g.mean)} p50=${r2(g.p50)} p95=${r2(g.p95)} p99=${r2(g.p99)} dropped=${g.dropped} skipped=${g.skipped}`
      : `   gpu=${g}`,
  );
  console.log(
    `   heap n=${heap.length} drops=${j.heap?.drops} maxGap=${Math.round(maxGap)}ms range=${r2(Math.min(...heapMB))}-${r2(Math.max(...heapMB))}MB`,
  );
  const t = Object.entries(j.timers ?? {})
    .map(([k, v]) => `${k} ${r2(v.mean)}/${r2(v.p95)}`)
    .join(" | ");
  console.log(`   timers(mean/p95): ${t}`);
  const c = j.counters ?? {};
  const cv = (k) => (c[k] && typeof c[k] === "object" ? `${r2(c[k].mean)}/${r2(c[k].p95)}` : c[k]);
  console.log(
    `   counters(mean/p95): drawGroups ${cv("drawGroups")} | uiQuads ${cv("uiQuads")} | glDrawCalls ${cv("glDrawCalls")} | instances ${cv("drawInstances")} | texBytes/frame ${cv("textureBytesPerFrame")} | texTotal ${c.textureBytesTotal} uploads ${c.textureUploads} created ${c.texturesCreated}`,
  );
  if (j.sceneReport) console.log(`   sceneReport: ${JSON.stringify(j.sceneReport).slice(0, 200)}`);
}
