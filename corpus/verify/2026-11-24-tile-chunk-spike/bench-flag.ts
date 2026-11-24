/**
 * A copy of scripts/bench.ts (brief 06) for the tile-chunk spike (corpus brief 21): the same headless run,
 * with extra URL parameters after `?bench&profile`, so the scene runs with `?tilechunks`.
 *
 *   node corpus/verify/2026-11-24-tile-chunk-spike/bench-flag.ts <folder> farm [--query=&tilechunks]
 *
 * Three things differ from the original: ROOT is three folders up, `--query` appends to the URL, and a
 * screenshot of the last frame is saved beside the JSON.
 * Needs `agent-browser` on the PATH, as the original does.
 */
import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
const SESSION = "game-engine-bench";
const STAMP = "gpu-not-real";
/** Boot, the 3 s warm-up and the 30 s run, with room for a slow software renderer. */
const RESULT_TIMEOUT_MS = 150_000;
const VIEWPORT = { width: 1280, height: 800 };

interface Server {
  /** The npm arguments that start it, from the repo root. */
  args: string[];
  port: number;
}

interface BenchGame {
  id: string;
  client: Server;
  /** Servers the client needs as well (Farm's sim host). */
  needs: Server[];
}

const GAMES: BenchGame[] = [
  {
    id: "farm",
    client: { args: ["run", "dev", "-w", "@farm/client", "--", "--port", "5173", "--strictPort"], port: 5173 },
    needs: [{ args: ["run", "server"], port: 8787 }],
  },
  {
    id: "citadel",
    client: { args: ["run", "dev", "-w", "@citadel/client", "--", "--port", "5174", "--strictPort"], port: 5174 },
    needs: [],
  },
  {
    id: "hollow",
    client: { args: ["run", "dev", "-w", "@hollow/client", "--", "--port", "5175", "--strictPort"], port: 5175 },
    needs: [],
  },
  {
    id: "mathquest",
    client: { args: ["run", "dev", "-w", "@mathquest/client", "--", "--port", "5176", "--strictPort"], port: 5176 },
    needs: [],
  },
];

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ab = (...args: string[]): string =>
  execFileSync("agent-browser", ["--session", SESSION, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }).trim();

/** Whether anything answers HTTP on the port (the sim host answers a plain request with an error). */
async function up(port: number): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}/`);
    return true;
  } catch {
    return false;
  }
}

/** Start a server in its own process group, so stopping it stops its children too. */
async function startServer(server: Server): Promise<ChildProcess> {
  const child = spawn("npm", server.args, { cwd: ROOT, detached: true, stdio: "ignore" });
  for (let i = 0; i < 120 && !(await up(server.port)); i++) await sleep(500);
  if (!(await up(server.port))) throw new Error(`npm ${server.args.join(" ")} did not start on :${server.port}`);
  return child;
}

function stop(child: ChildProcess | null): void {
  if (child?.pid !== undefined) process.kill(-child.pid, "SIGTERM");
}

/** `agent-browser eval` prints a string result as JSON; unwrap it. */
function evalString(expression: string): string {
  const out = ab("eval", expression);
  if (out.startsWith('"')) {
    const value: unknown = JSON.parse(out);
    return typeof value === "string" ? value : "";
  }
  return out;
}

type Json = Record<string, unknown>;

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Replaces the named fields of `obj` with the stamp, leaving counts in place. */
function stampFields(obj: unknown, keys: readonly string[]): void {
  if (!isRecord(obj)) return;
  for (const key of keys) if (key in obj) obj[key] = STAMP;
}

/** Stamps every frame-time field when the result came from SwiftShader. Returns whether it did. */
function stampIfSoftware(result: Json): boolean {
  const device = isRecord(result.device) ? result.device : {};
  const renderer = typeof device.renderer === "string" ? device.renderer : "";
  if (!/swiftshader/i.test(renderer)) return false;
  const frames = isRecord(result.frames) ? result.frames : {};
  stampFields(frames.interval, ["mean", "p50", "p95", "p99", "over16_7", "over33_3", "fps"]);
  stampFields(frames.drawn, ["meanMs", "p95Ms", "fps"]);
  stampFields(result.gpu, ["mean", "p50", "p95", "p99"]);
  result.bench = { frameTimes: STAMP, renderer };
  return true;
}

async function runGame(game: BenchGame, folder: string): Promise<void> {
  const started: ChildProcess[] = [];
  try {
    for (const server of [...game.needs, game.client]) {
      if (!(await up(server.port))) started.push(await startServer(server));
    }
    ab("open", `http://localhost:${game.client.port}/?bench&profile${QUERY}`);
    const deadline = Date.now() + RESULT_TIMEOUT_MS;
    let raw = "";
    while (raw === "" && Date.now() < deadline) {
      await sleep(2000);
      raw = evalString("window.__benchResult ? JSON.stringify(window.__benchResult) : ''");
    }
    if (raw === "") throw new Error(`${game.id}: ?bench never set window.__benchResult`);
    const result: unknown = JSON.parse(raw);
    if (!isRecord(result)) throw new Error(`${game.id}: __benchResult is not an object`);
    // The copy's third difference: the screen as the run ended, beside the JSON.
    ab("screenshot", join(folder, `${game.id}.png`));
    const stamped = stampIfSoftware(result);
    const file = join(folder, `${game.id}.json`);
    writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
    console.log(`[bench] ${game.id}: ${String(result.scene)} → ${file}${stamped ? ` (frame times ${STAMP})` : ""}`);
  } finally {
    for (const child of started.reverse()) stop(child);
  }
}

const args = process.argv.slice(2);
const QUERY = args.find((a) => a.startsWith("--query="))?.slice("--query=".length) ?? "";
const [folderArg, ...only] = args.filter((a) => !a.startsWith("--query="));
if (folderArg === undefined) {
  console.error("usage: node bench-flag.ts <folder> [farm|citadel|hollow|mathquest …] [--query=&tilechunks]");
  process.exit(2);
}
// npm runs a script from the repo root; a relative folder is read from where `npm run` was typed.
const folder = resolve(process.env.INIT_CWD ?? process.cwd(), folderArg);
mkdirSync(folder, { recursive: true });
ab("set", "viewport", String(VIEWPORT.width), String(VIEWPORT.height));
let failed = false;
for (const game of GAMES) {
  if (only.length > 0 && !only.includes(game.id)) continue;
  try {
    await runGame(game, folder);
  } catch (err) {
    failed = true;
    console.error(`[bench] ${game.id}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
ab("close");
process.exit(failed ? 1 : 0);
