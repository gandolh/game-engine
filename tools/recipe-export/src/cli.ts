/**
 * `npm run recipe:export -- <game> <frame> [--out <path>]` writes the recipe as an indexed PNG (corpus brief 23).
 * `--out` is a file, or a folder (the file is then named after the frame); the default is the current folder.
 * Writes nothing else.
 */
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { recipeToPng } from "./export";
import { findRecipe, gameConfig, pngNameOf } from "./games";

/** npm runs a workspace script from the package folder; INIT_CWD is where the user typed the command. */
const cwd = process.env["INIT_CWD"] ?? process.cwd();

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const outAt = args.indexOf("--out");
  const out = outAt >= 0 ? args[outAt + 1] : undefined;
  const pos = args.filter((a, i) => !a.startsWith("--") && (outAt < 0 || i !== outAt + 1));
  const [game, frame] = pos;
  if (!game || !frame || (outAt >= 0 && !out)) {
    console.error("usage: recipe:export <game> <frame> [--out <file.png | folder>]");
    process.exit(2);
  }
  const config = gameConfig(game);
  const recipe = findRecipe(config, frame);
  const target = out ? resolve(cwd, out) : cwd;
  const file = isDir(target) || (!out && !target.endsWith(".png")) ? resolve(target, pngNameOf(frame)) : target;
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, recipeToPng(config, recipe));
  console.log(`wrote ${file}`);
}

try {
  main();
} catch (e) {
  console.error(`recipe-export: ${(e as Error).message}`);
  process.exit(1);
}
