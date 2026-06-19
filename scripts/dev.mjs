#!/usr/bin/env node
/**
 * dev.mjs — zero-dep concurrent dev runner (brief 58).
 *
 * `npm run dev` now needs BOTH the Node sim server and the Vite client, since
 * the sim lives in the server and the browser is a pure client. This spawns
 * both, prefixes their output, and tears both down when either exits or on
 * Ctrl-C — so there's one command and no orphaned processes.
 *
 * Kept dependency-free (no `concurrently`) to honor the repo's zero-dep stance.
 */
import { spawn } from "node:child_process";

const procs = [
  { name: "server", cmd: "npm", args: ["run", "server"], color: "\x1b[36m" },
  { name: "client", cmd: "npm", args: ["run", "dev", "-w", "farm-valley"], color: "\x1b[35m" },
];

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

for (const p of procs) {
  const child = spawn(p.cmd, p.args, { stdio: ["inherit", "pipe", "pipe"], env: process.env });
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
