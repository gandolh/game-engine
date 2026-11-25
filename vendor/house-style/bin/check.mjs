// The one-pass gate runner. A repo calls it from its `check` script, with its own step list:
//   "check": "node vendor/house-style/bin/check.mjs typecheck lint format:check check:conventions test"
// It runs the named npm scripts one after another and keeps going after a failure, so one run shows every failing
// step. Steps joined by `+` run side by side, and the groups one after another: `typecheck+lint test` runs typecheck
// and lint together, then test alone. It prints a line per step with its time as each finishes, then the tail of each
// failure, and keeps the whole output in node_modules/.cache/check/last.log, one block per step: read that log
// instead of running the gate again. Exit 0 when every step passed, 1 when one failed, 2 for an unknown or missing
// step name.
import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { constants } from "node:os";

const LOG = "node_modules/.cache/check/last.log";
const TAIL_LINES = 40;
const posix = process.platform !== "win32";

const groups = process.argv.slice(2).map((arg) => arg.split("+").filter(Boolean));
const steps = groups.flat();
const scripts = JSON.parse(readFileSync("package.json", "utf8")).scripts ?? {};
const unknown = steps.filter((step) => !Object.hasOwn(scripts, step));
if (steps.length === 0 || unknown.length > 0) {
  console.error(`check: no npm script named ${unknown.join(", ") || "(none given)"}`);
  process.exit(2);
}

mkdirSync("node_modules/.cache/check", { recursive: true });
writeFileSync(LOG, "");
console.log(`check: ${groups.map((group) => group.join(" + ")).join(", then ")}. Full output: ${LOG}`);

const running = new Set();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal, () => {
    // Each step runs in its own process group, so a timeout or Ctrl-C must stop them here or they outlive the gate.
    for (const child of running) stop(child, signal);
    process.exit(128 + constants.signals[signal]);
  });
}

const results = new Map();
for (const group of groups) {
  // A step alone writes its output into the log as it comes, so the log can be followed; steps side by side each
  // write theirs as one block when they finish, so their lines don't interleave.
  const live = group.length === 1;
  await Promise.all(
    group.map(async (step) => {
      const started = performance.now();
      if (live) appendFileSync(LOG, `\n===== npm run ${step}\n`);
      const { code, output } = await run(step, live);
      if (!live) appendFileSync(LOG, `\n===== npm run ${step}\n${output}`);
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      console.log(`${code === 0 ? "ok  " : "FAIL"} ${step} (${seconds} s)`);
      results.set(step, { code, output });
    }),
  );
}

const failed = steps.filter((step) => results.get(step)?.code !== 0);
for (const step of failed) {
  const { code, output } = results.get(step) ?? { code: 1, output: "" };
  console.log(`\n--- ${step} failed with exit ${code}. Its last lines:`);
  console.log(output.trimEnd().split("\n").slice(-TAIL_LINES).join("\n"));
}
console.log(failed.length === 0 ? "\ncheck passed" : `\ncheck failed: ${failed.join(", ")}`);
process.exit(failed.length === 0 ? 0 : 1);

/**
 * Runs one npm script with its output captured (and written into the log as it comes when `live`), and resolves
 * with its exit code and output.
 */
function run(step, live) {
  return new Promise((resolve) => {
    const child = spawn("npm", ["run", step], { detached: posix, shell: !posix });
    running.add(child);
    const chunks = [];
    const keep = (data) => {
      chunks.push(data);
      if (live) appendFileSync(LOG, data);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("error", (error) => keep(Buffer.from(`${error.message}\n`)));
    child.on("close", (code) => {
      running.delete(child);
      resolve({ code: code ?? 1, output: Buffer.concat(chunks).toString() });
    });
  });
}

/** Sends the signal to the step's whole process group (npm, its shell and the tool), not only to npm. */
function stop(child, signal) {
  try {
    if (posix) process.kill(-child.pid, signal);
    else child.kill(signal);
  } catch {
    // The step had already exited.
  }
}
