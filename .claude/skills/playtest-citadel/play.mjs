/**
 * Citadel automated playtest driver (Playwright + system Chrome, WebGPU).
 *
 * Boots the live client, builds a connected economy via the dev-only
 * `window.__citadel.send` hook (same command channel the UI uses), runs at a
 * chosen speed, climbs settlement tiers, places tier-locked buildings as they
 * unlock, attempts upgrades + barters, and records a structured timeline +
 * screenshots. It produces EVIDENCE; the human/Claude reads report.json and the
 * shots, then writes the findings. See SKILL.md.
 *
 * Placement is PHASED + self-verifying: buildings are sent, the live snapshot is
 * re-read, and any that didn't land are retried at a fresh clear spot — THEN
 * roads are laid around the buildings that actually exist. (Sending buildings and
 * a big road carpet in one burst can let the carpet claim tiles before the
 * buildings resolve, silently dropping them — itself a logged finding.)
 *
 * Env knobs:
 *   URL       (default http://localhost:5174/)   the running Citadel client
 *   OUT       (default ./citadel-playtest-out)    screenshots + report.json
 *   SECONDS   (default 150)                        wall-clock budget for the run
 *   SPEED     (default 4)                          1 | 2 | 4
 *   HEADED    (default 1)                          1 = visible window (WebGPU needs a real GPU)
 *
 * Run:  node .claude/skills/playtest-citadel/play.mjs
 * (Requires the Citadel client running — `npm run citadel`, port 5174.)
 */
import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

async function resolvePlaywright() {
  try { return await import("playwright"); } catch { /* fall through */ }
  const home = process.env.USERPROFILE || process.env.HOME || "";
  const npx = join(home, "AppData/Local/npm-cache/_npx");
  if (existsSync(npx)) {
    for (const h of readdirSync(npx)) {
      const p = join(npx, h, "node_modules/playwright/index.js");
      if (existsSync(p)) return createRequire(pathToFileURL(p))("./index.js");
    }
  }
  throw new Error("Playwright not found. Install once: `npm i -D playwright@1.61.0`.");
}

const URL = process.env.URL || "http://localhost:5174/";
const OUT = process.env.OUT || "./citadel-playtest-out";
const SECONDS = parseInt(process.env.SECONDS || "150", 10);
const SPEED = parseInt(process.env.SPEED || "4", 10);
const HEADED = process.env.HEADED !== "0";
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const pw = await resolvePlaywright();
const browser = await pw.chromium.launch({
  channel: "chrome",
  headless: !HEADED,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on("console", (m) => { if (/error|exception|fail/i.test(m.text())) pageErrors.push(m.text()); });
page.on("pageerror", (e) => pageErrors.push(String(e)));

const report = { startedAt: new Date().toISOString(), url: URL, speed: SPEED, timeline: [], notes: [], pageErrors };
const note = (s) => { console.log(s); report.notes.push(s); };

// Send a list of {type,x,y} buildings, then verify against the live snapshot and
// retry any that didn't land at a fresh clear spot. Returns {placed, missing}.
async function placeAndVerify(desired, rounds = 3) {
  let pending = desired.slice();
  for (let r = 0; r < rounds && pending.length; r++) {
    pending = await page.evaluate((items) => {
      const C = window.__citadel, t = C.terrain(), W = t.width, H = t.height, cells = t.cells;
      const DEF = { house: [2, 2], farm: [3, 3], mill: [2, 2], bakery: [2, 2], woodcutter: [2, 2], storehouse: [3, 2], chapel: [2, 2], market: [2, 2], watchpost: [2, 2], tradingpost: [3, 2], quarry: [2, 2], sawmill: [2, 2], smith: [2, 2], tower: [2, 2], keep: [3, 3], garrison: [3, 2] };
      const walk = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return false; const v = cells[y * W + x]; return v === 0 || v === 4; };
      const occ = new Set();
      const live = C.buildings();
      const has = (type, x, y) => live.some((b) => b.type === type && b.x === x && b.y === y);
      for (const b of live) for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) occ.add((b.y + yy) * W + (b.x + xx));
      const free = (x, y, w, h) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const cx = x + xx, cy = y + yy; if (!walk(cx, cy) || occ.has(cy * W + cx)) return false; } return true; };
      const findClear = (w, h, sx, sy) => { for (let r = 0; r < 50; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x > 0 && y > 0 && x < W - w && y < H - h && free(x, y, w, h)) return { x, y }; } return null; };
      const stillMissing = [];
      for (const it of items) {
        if (has(it.type, it.x, it.y)) continue; // already there from a prior round
        const [w, h] = DEF[it.type] || [2, 2];
        const p = free(it.x, it.y, w, h) ? { x: it.x, y: it.y } : findClear(w, h, it.x, it.y);
        if (!p) { stillMissing.push({ ...it, reason: "no clear spot" }); continue; }
        C.send({ type: "placeBuilding", payload: { buildingType: it.type, x: p.x, y: p.y } });
        for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) occ.add((p.y + yy) * W + (p.x + xx));
        stillMissing.push({ ...it, x: p.x, y: p.y });
      }
      return stillMissing;
    }, pending);
    await sleep(700);
    // Drop the ones that now exist.
    pending = await page.evaluate((items) => {
      const live = window.__citadel.buildings();
      return items.filter((it) => !live.some((b) => b.type === it.type && b.x === it.x && b.y === it.y));
    }, pending);
  }
  return { missing: pending };
}

try {
  note(`navigating to ${URL} …`);
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__citadel, { timeout: 20000 });
  await sleep(1200);
  report.backend = await page.evaluate(() => ({ hasGPU: !!navigator.gpu, canvas: !!document.getElementById("canvas") }));
  if (!report.backend.hasGPU) note("WARNING: navigator.gpu undefined — WebGPU unavailable.");
  await page.screenshot({ path: join(OUT, "00-boot.png") });

  // The full bootstrap (plan → place+verify → roads). Re-callable: Vite HMR will
  // full-reload the client (wiping the Worker sim to day 1) if a watched sim file
  // changes mid-run, so the loop re-invokes this when it detects a reset.
  let plan;
  async function bootstrap() {
  // Phase 1: compute the economy plan (occupancy-aware) — does NOT send.
  plan = await page.evaluate(() => {
    const C = window.__citadel, t = C.terrain(), W = t.width, H = t.height, cells = t.cells;
    const Forest = 2, Stone = 3;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : cells[y * W + x]);
    const walk = (x, y) => { const v = at(x, y); return v === 0 || v === 4; };
    const occ = new Set();
    const free = (x, y, w, h) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { const cx = x + xx, cy = y + yy; if (!walk(cx, cy) || occ.has(cy * W + cx)) return false; } return true; };
    const mark = (x, y, w, h) => { for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) occ.add((y + yy) * W + (x + xx)); };
    const findClear = (w, h, sx, sy) => { for (let r = 0; r < 50; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x > 0 && y > 0 && x < W - w && y < H - h && free(x, y, w, h)) return { x, y }; } return null; };
    const DEF = { house: [2, 2], farm: [3, 3], mill: [2, 2], bakery: [2, 2], woodcutter: [2, 2], storehouse: [3, 2], chapel: [2, 2], market: [2, 2], watchpost: [2, 2], tradingpost: [3, 2], well: [1, 1] };
    const cx = Math.floor(W / 2), cy = Math.floor(H / 2);
    const want = [];
    const add = (type, sx, sy) => { const [w, h] = DEF[type]; const p = findClear(w, h, sx, sy); if (p) { mark(p.x, p.y, w, h); want.push({ type, x: p.x, y: p.y }); return p; } return { x: sx, y: sy }; };
    // Buildings on a 6-tile grid so wooden structures are ≥4 tiles apart — fire
    // punishes tight clusters (wiki), so a packed layout burns down by ~day 25.
    // Wells added for ignition mitigation. Services kept within radius-8 of houses.
    const P = 6;
    const base = add("storehouse", cx, cy);
    const G = (col, row) => ({ x: base.x + col * P, y: base.y + row * P });
    add("farm", G(1, -1).x, G(1, -1).y); add("farm", G(2, 1).x, G(2, 1).y);
    add("mill", G(-1, -1).x, G(-1, -1).y); add("mill", G(1, 0).x, G(1, 0).y);
    add("bakery", G(-2, 0).x, G(-2, 0).y); add("bakery", G(0, -1).x, G(0, -1).y);
    add("house", G(-1, 1).x, G(-1, 1).y); add("house", G(0, 1).x + 1, G(0, 1).y);
    add("house", G(-1, 2).x, G(-1, 2).y); add("house", G(0, 2).x + 1, G(0, 2).y);
    // Services clustered near the houses (rows 1-2) and inside radius 8 of them.
    add("chapel", G(-2, 1).x, G(-2, 1).y); add("market", G(1, 1).x, G(1, 1).y); add("watchpost", G(-1, 1).x, G(-1, 1).y + 3);
    add("tradingpost", G(2, 0).x, G(2, 0).y);
    add("well", G(0, 1).x - 1, G(0, 1).y); add("well", G(-1, 2).x + 3, G(-1, 2).y);
    // Woodcutter wants a forest-adjacent tile; only flag the intent (terrainReq handled by sim).
    let woodSpot = null;
    for (let r = 0; r < 60 && !woodSpot; r++) for (let dy = -r; dy <= r && !woodSpot; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = base.x + 12 + dx, y = base.y + dy;
      if (x > 0 && y > 0 && x < W - 2 && y < H - 2 && free(x, y, 2, 2) && (at(x - 1, y) === Forest || at(x + 2, y) === Forest || at(x, y - 1) === Forest || at(x, y + 2) === Forest)) { woodSpot = { x, y }; }
    }
    if (woodSpot) { mark(woodSpot.x, woodSpot.y, 2, 2); want.push({ type: "woodcutter", x: woodSpot.x, y: woodSpot.y }); }
    // Stone spot for a later quarry (Village-locked).
    let stoneSpot = null;
    for (let r = 0; r < 60 && !stoneSpot; r++) for (let dy = -r; dy <= r && !stoneSpot; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = base.x - 12 + dx, y = base.y + dy;
      if (x > 0 && y > 0 && x < W - 2 && y < H - 2) { for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 2; xx++) if (at(x + xx, y + yy) === Stone) stoneSpot = { x, y }; }
    }
    return { want, base, stoneSpot, W, H };
  });
  note(`plan: ${plan.want.length} buildings (base ${plan.base.x},${plan.base.y})`);

  // Phase 2: place + verify + retry.
  const econ = await placeAndVerify(plan.want);
  report.economyMissing = econ.missing;
  if (econ.missing.length) note(`WARNING: ${econ.missing.length} economy buildings never landed: ${econ.missing.map((m) => m.type).join(",")}`);

  // Phase 3: lay roads around the buildings that ACTUALLY exist.
  report.roadCount = await page.evaluate(() => {
    const C = window.__citadel, t = C.terrain(), W = t.width, cells = t.cells;
    const walk = (x, y) => { const v = cells[y * W + x]; return v === 0 || v === 4; };
    const live = C.buildings().filter((b) => b.type !== "road" && b.type !== "wall");
    if (!live.length) return 0;
    const occ = new Set();
    for (const b of C.buildings()) for (let yy = 0; yy < b.h; yy++) for (let xx = 0; xx < b.w; xx++) occ.add((b.y + yy) * W + (b.x + xx));
    const xs = live.flatMap((b) => [b.x, b.x + b.w]); const ys = live.flatMap((b) => [b.y, b.y + b.h]);
    const left = Math.max(1, Math.min(...xs) - 1), right = Math.min(W - 2, Math.max(...xs) + 1);
    const top = Math.max(1, Math.min(...ys) - 1), bot = Math.min(t.height - 2, Math.max(...ys) + 1);
    const tiles = [];
    for (let ry = top; ry <= bot; ry++) for (let rx = left; rx <= right; rx++) if (walk(rx, ry) && !occ.has(ry * W + rx)) tiles.push({ x: rx, y: ry });
    C.send({ type: "placeRoad", payload: { tiles } });
    return tiles.length;
  });
  await sleep(700);
  note(`roads laid: ${report.roadCount}`);
  await page.click(`#btn-${SPEED}x`).catch(() => {});
  await sleep(400);
  } // end bootstrap()

  await bootstrap();
  await page.screenshot({ path: join(OUT, "01-placed.png") });

  // Read game state from the authoritative live snapshot (window.__citadel.snapshot()),
  // falling back to the DOM HUD only for fields not on the snapshot. The in-canvas UI
  // migration (2026-06-30) left the DOM #hud-* nodes stale/absent, so the snapshot is
  // the source of truth — it also carries `allHomesCovered`, letting us assert the
  // Phase-F contentment-banner edge instead of inferring it.
  const readHud = () => page.evaluate(() => {
    const bs = window.__citadel.buildings();
    const byType = {}, byLevel = { 1: 0, 2: 0, 3: 0 };
    for (const b of bs) { byType[b.type] = (byType[b.type] || 0) + 1; if (b.level) byLevel[b.level]++; }
    const s = window.__citadel.snapshot ? window.__citadel.snapshot() : null;
    if (s) {
      return {
        src: "snapshot",
        tier: String(s.tier || ""), day: `Day ${s.day + 1}`,
        pop: s.population ?? null, popCap: s.popCap ?? null,
        bread: s.stockpiles?.bread ?? null, wood: s.stockpiles?.wood ?? null,
        happy: s.happiness ?? null,
        allHomesCovered: !!s.allHomesCovered,
        activeFires: s.activeFires ?? null,
        buildingCount: bs.length, byType, byLevel,
      };
    }
    // Fallback: DOM scrape (stale since the in-canvas UI migration; kept for safety).
    const txt = (id) => (document.getElementById(id)?.textContent || "").trim();
    const num = (v) => { const m = String(v).match(/-?\d+/); return m ? parseInt(m[0], 10) : null; };
    const popStr = txt("hud-pop");
    return {
      src: "dom",
      tier: txt("hud-tier").replace(/^Tier:\s*/i, ""), day: txt("hud-day"),
      pop: num(popStr), popCap: num(popStr.split("/")[1] || ""),
      bread: num(txt("hud-bread")), wood: num(txt("hud-wood")), happy: num(txt("hud-happiness")),
      allHomesCovered: null, activeFires: null,
      buildingCount: bs.length, byType, byLevel,
    };
  });

  const placeVillage = () => placeAndVerify([
    { type: "sawmill", x: plan.base.x - 1, y: plan.base.y - 8 },
    { type: "smith", x: plan.base.x + 3, y: plan.base.y - 8 },
    { type: "tower", x: plan.base.x + 9, y: plan.base.y - 4 },
    ...(plan.stoneSpot ? [{ type: "quarry", x: plan.stoneSpot.x, y: plan.stoneSpot.y }] : []),
  ]).then(() => page.evaluate((base) => {
    const C = window.__citadel; const wall = []; const tx = base.x + 9 - 3, ty = base.y - 6;
    for (let k = 0; k < 5; k++) wall.push({ x: tx, y: ty + k });
    C.send({ type: "placeWall", payload: { tiles: wall } });
    C.send({ type: "placeBuilding", payload: { buildingType: "gate", x: tx, y: ty + 2 } });
  }, plan.base));

  const placeTown = () => placeAndVerify([
    { type: "keep", x: plan.base.x + 11, y: plan.base.y + 4 },
    { type: "garrison", x: plan.base.x + 11, y: plan.base.y - 2 },
  ]);

  const tryUpgradesAndBarter = () => page.evaluate(() => {
    const C = window.__citadel;
    // Only real structures upgrade — never spam upgrade commands at roads/walls/gates.
    const skip = new Set(["road", "wall", "gate", "bridge"]);
    for (const b of C.buildings()) if (!skip.has(b.type) && (b.level ?? 1) < 3) C.send({ type: "upgradeBuilding", payload: { x: b.x, y: b.y } });
    const panel = document.getElementById("trader-offers");
    if (panel) panel.querySelectorAll("button").forEach((btn, i) => { if (/plank|stone|tool/i.test(btn.textContent || "")) C.send({ type: "barter", payload: { offerIndex: i } }); });
  });

  let villageDone = false, townDone = false, reloads = 0, prevCount = 999;
  const t0 = Date.now();
  const tierRank = (s) => ["Hamlet", "Village", "Town", "Citadel", "Fortress-City"].indexOf((s || "").trim());
  const allTypes = new Set();
  // Phase-F contentment banner: track the false→true edge of allHomesCovered so
  // the report can state whether a fully-covered town was ever achieved live.
  let prevCovered = null, coveredEverTrue = false, coveredEdgeAt = null;
  for (let i = 0; i < Math.ceil((SECONDS * 1000) / 4000); i++) {
    await sleep(4000);
    const h = await readHud();
    const secs = Math.round((Date.now() - t0) / 1000);
    // Detect a Vite HMR full-reload (sim wiped to ~0 buildings) and re-bootstrap.
    if (prevCount > 50 && h.buildingCount < 5) {
      reloads++;
      note(`>> client reloaded (HMR wiped the sim) at t=${secs}s — re-bootstrapping (#${reloads}). Avoid editing watched game files during a run.`);
      if (reloads > 5) { note("too many reloads — aborting; run against a quiescent tree."); break; }
      villageDone = townDone = false;
      await bootstrap();
      prevCount = 999;
      continue;
    }
    prevCount = h.buildingCount;
    Object.keys(h.byType).forEach((tp) => allTypes.add(tp));
    // Track the Phase-F banner rising edge (false→true), mirroring main.ts's latch.
    if (h.allHomesCovered === true) {
      if (prevCovered === false) { coveredEdgeAt = secs; note(`>> allHomesCovered flipped true at t=${secs}s (${h.day}) — Phase-F banner edge`); }
      coveredEverTrue = true;
    }
    if (typeof h.allHomesCovered === "boolean") prevCovered = h.allHomesCovered;
    report.timeline.push({ secs, ...h });
    console.log(`t=${secs}s ${h.day} tier=${h.tier} pop=${h.pop}/${h.popCap} happy=${h.happy} bread=${h.bread} covered=${h.allHomesCovered} bld=${h.buildingCount} L=${JSON.stringify(h.byLevel)}`);
    if (!villageDone && tierRank(h.tier) >= 1) { villageDone = true; note(">> Village — placing sawmill/smith/tower/wall/gate/quarry"); await placeVillage(); await page.screenshot({ path: join(OUT, "02-village.png") }); }
    if (!townDone && tierRank(h.tier) >= 2) { townDone = true; note(">> Town — placing keep/garrison"); await placeTown(); await page.screenshot({ path: join(OUT, "03-town.png") }); }
    await tryUpgradesAndBarter();
    if (secs >= SECONDS) break;
  }

  await page.screenshot({ path: join(OUT, "99-final.png") });
  report.final = await readHud();
  report.reloads = reloads;
  report.typesEverSeen = [...allTypes].sort();
  const f = report.final;
  report.outcome = {
    reachedTier: f.tier,
    maxLevelSeen: f.byLevel[3] > 0 ? 3 : f.byLevel[2] > 0 ? 2 : 1,
    unlockedAll: ["keep", "garrison", "tower", "sawmill", "smith", "quarry"].every((t) => report.typesEverSeen.includes(t)),
    upgradedAll: f.byLevel[1] === 0 && f.byLevel[2] === 0 && f.byLevel[3] > 0,
    finalPop: f.pop,
    // Phase-F acceptance signal: did a fully-covered town ever occur, and when did the edge fire?
    allHomesCoveredEver: coveredEverTrue,
    allHomesCoveredEdgeAtSecs: coveredEdgeAt,
    finalAllHomesCovered: f.allHomesCovered ?? null,
  };
} catch (err) {
  report.error = String(err && err.stack ? err.stack : err);
  note("ERROR: " + report.error);
} finally {
  writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
  note(`wrote ${join(OUT, "report.json")}`);
  await browser.close();
}
