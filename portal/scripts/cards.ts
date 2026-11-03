/**
 * Retake the portal's card art: each game's DEV-only `?card` scene, captured at 640×480 and mapped
 * onto that game's palette (washes and Hollow's 3D shading aren't on it), written to
 * `public/cards/<id>.png`.
 *
 *   npm run cards -w @game-engine/portal
 *
 * Needs `agent-browser` on the PATH (as `docs/images/shots.md` does). A game's dev server that is
 * already up is reused; one that isn't is started and stopped again.
 */
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { CARD_PALETTES } from "../src/card-palettes";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const OUT = join(ROOT, "portal", "public", "cards");
const SESSION = "portal-cards";

const GAMES = [
  { id: "farm-valley", workspace: "@farm/client", port: 5173 },
  { id: "citadel", workspace: "@citadel/client", port: 5174 },
  { id: "hollow", workspace: "@hollow/client", port: 5175 },
  { id: "mathquest", workspace: "@mathquest/client", port: 5176 },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ab = (...args: string[]): string => execFileSync("agent-browser", ["--session", SESSION, ...args], { encoding: "utf8" }).trim();

async function up(port: number): Promise<boolean> {
  try {
    return (await fetch(`http://localhost:${port}/`)).ok;
  } catch {
    return false;
  }
}

/** Start a dev server in its own process group, so stopping it stops Vite too. */
async function startServer(workspace: string, port: number): Promise<ChildProcess> {
  const child = spawn("npm", ["run", "dev", "-w", workspace, "--", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 60 && !(await up(port)); i++) await sleep(500);
  if (!(await up(port))) throw new Error(`${workspace} did not start on :${port}`);
  return child;
}

function hex(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Map every pixel to the nearest palette colour (RGB distance), opaque. */
function toPalette(png: PNG, palette: readonly string[]): PNG {
  const swatches = palette.map(hex);
  const memo = new Map<number, [number, number, number]>();
  for (let i = 0; i < png.data.length; i += 4) {
    const key = (png.data[i]! << 16) | (png.data[i + 1]! << 8) | png.data[i + 2]!;
    let best = memo.get(key);
    if (!best) {
      let d = Infinity;
      for (const s of swatches) {
        const e = (s[0] - png.data[i]!) ** 2 + (s[1] - png.data[i + 1]!) ** 2 + (s[2] - png.data[i + 2]!) ** 2;
        if (e < d) {
          d = e;
          best = s;
        }
      }
      memo.set(key, best!);
    }
    png.data[i] = best![0];
    png.data[i + 1] = best![1];
    png.data[i + 2] = best![2];
    png.data[i + 3] = 255;
  }
  return png;
}

const only = process.argv.slice(2);
const tmp = mkdtempSync(join(tmpdir(), "portal-cards-"));
ab("set", "viewport", "640", "480");
for (const g of GAMES) {
  if (only.length > 0 && !only.includes(g.id)) continue;
  const started = (await up(g.port)) ? null : await startServer(g.workspace, g.port);
  try {
    ab("open", `http://localhost:${g.port}/?card`);
    let ready = false;
    for (let i = 0; i < 90 && !ready; i++) {
      await sleep(1000);
      ready = ab("eval", "String(window.__cardReady === true)").includes("true");
    }
    if (!ready) throw new Error(`${g.id}: ?card never set window.__cardReady`);
    const shot = join(tmp, `${g.id}.png`);
    ab("screenshot", shot);
    const png = toPalette(PNG.sync.read(readFileSync(shot)), CARD_PALETTES[g.id] ?? []);
    if (png.width * 3 !== png.height * 4) throw new Error(`${g.id}: capture is ${png.width}×${png.height}, not 4:3`);
    writeFileSync(join(OUT, `${g.id}.png`), PNG.sync.write(png));
    console.log(`[cards] ${g.id}: ${png.width}×${png.height} → public/cards/${g.id}.png`);
  } finally {
    if (started?.pid !== undefined) process.kill(-started.pid, "SIGTERM");
  }
}
ab("close");
