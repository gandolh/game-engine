/**
 * `npm run recipe:import -- <game> <file.png> [--frame <name>] [--out <file>]` turns an edited PNG back into a
 * recipe file (corpus brief 23). The frame defaults to the PNG's name (`tile__grass.png` is `tile/grass`, as
 * `recipe:export` names it). The game's own recipe file is only read, as the template. The new text goes to
 * `--out`, and to stdout without it: the tool never writes a recipe unless asked where.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { frameOfPngName, gameConfig } from "@tool/recipe-export";
import { importRecipe } from "./import";

/** npm runs a workspace script from the package folder; INIT_CWD is where the user typed the command. */
const cwd = process.env["INIT_CWD"] ?? process.cwd();

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const frameFlag = flag("--frame");
  const out = flag("--out");
  const skip = new Set(
    [args.indexOf("--frame"), args.indexOf("--out")].filter((i) => i >= 0).flatMap((i) => [i, i + 1]),
  );
  const [game, file] = args.filter((_, i) => !skip.has(i));
  if (!game || !file) {
    console.error("usage: recipe:import <game> <file.png> [--frame <name>] [--out <recipe file>]");
    process.exit(2);
  }
  const config = gameConfig(game);
  const text = importRecipe(config, frameFlag ?? frameOfPngName(file), readFileSync(resolve(cwd, file)));
  if (out) {
    writeFileSync(resolve(cwd, out), text);
    console.log(`wrote ${resolve(cwd, out)}`);
  } else {
    process.stdout.write(text);
  }
}

try {
  main();
} catch (e) {
  console.error(`recipe-import: ${(e as Error).message}`);
  process.exit(1);
}
