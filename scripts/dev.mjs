#!/usr/bin/env node
/**
 * dev.mjs — zero-dep concurrent dev runner (brief 58).
 *
 * Spawns a game's Node sim server + its Vite client together, prefixes their
 * output, and tears both down when either exits or on Ctrl-C — so there's one
 * command and no orphaned processes. Kept dependency-free (no `concurrently`).
 *
 * Usage: `node scripts/dev.mjs [farm|citadel]` (default: farm).
 *   farm    — `npm run dev` (Farm sim runs server-side; client always needs it).
 *   citadel — `npm run citadel` (server + client; open the client with `?mp`
 *             for online multiplayer — solo Citadel runs in an in-browser Worker
 *             and doesn't need the server).
 */
import { spawn } from "node:child_process";

const TARGETS = {
  farm: {
    procs: [
      { name: "server", cmd: "npm", args: ["run", "server"], color: "\x1b[36m" },
      { name: "client", cmd: "npm", args: ["run", "dev", "-w", "@farm/client"], color: "\x1b[35m" },
    ],
  },
  citadel: {
    procs: [
      { name: "server", cmd: "npm", args: ["run", "server:citadel"], color: "\x1b[36m" },
      { name: "client", cmd: "npm", args: ["run", "dev", "-w", "@citadel/client"], color: "\x1b[35m" },
    ],
    note: "Citadel: open http://localhost:5174/?mp for online multiplayer (solo needs no server).",
  },
};

const target = process.argv[2] ?? "farm";
const config = TARGETS[target];
if (config === undefined) {
  console.error(`dev.mjs: unknown target "${target}" (expected: ${Object.keys(TARGETS).join(", ")})`);
  process.exit(1);
}
if (config.note) console.log(`\x1b[33m${config.note}\x1b[0m`);

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill("SIGTERM");
  }
  process.exit(code ?? 0);
}

for (const p of config.procs) {
  // shell: true so Windows resolves `npm` → `npm.cmd` (plain spawn fails with ENOENT otherwise).
  const child = spawn(p.cmd, p.args, { stdio: ["inherit", "pipe", "pipe"], env: process.env, shell: true });
  children.push(child);
  const tag = `${p.color}[${p.name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(tag + `exited (${code})\n`);
    shutdown(code ?? 0);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
