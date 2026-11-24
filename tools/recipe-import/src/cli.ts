/**
 * `npm run recipe:import -- <game> <file.png> [--frame <name>] [--out <file>]` turns an edited PNG back into a
 * recipe file (corpus brief 23). The frame defaults to the PNG's name (`tile__grass.png` is `tile/grass`, as
 * `recipe:export` names it). The game's own recipe file is only read, as the template.
 *
 * `npm run recipe:import -- <game> <grid.txt> --frame <name> [--grid-frame <name>] [--width <w>] [--height <h>]
 * [--out <file>]` turns sprite-gen's `pixel-draw` drawing into a new recipe file named `<name>` (corpus brief 13),
 * cropped to the width and height when given. `--grid-frame` picks a frame when the file holds several.
 *
 * The new text goes to `--out`, and to stdout without it: the tool never writes a recipe unless asked where.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { frameOfPngName, gameConfig, recipeSrcDir } from "@tool/recipe-export";
import { readGridText, recipeSource } from "./grid";
import { importRecipe } from "./import";

/** npm runs a workspace script from the package folder; INIT_CWD is where the user typed the command. */
const cwd = process.env["INIT_CWD"] ?? process.cwd();

const VALUE_FLAGS = ["--frame", "--grid-frame", "--width", "--height", "--out"];

function main(): void {
  const args = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const size = (name: string): number | undefined => {
    const v = flag(name);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} must be a whole number above 0, not "${v}"`);
    return n;
  };
  const frameFlag = flag("--frame");
  const out = flag("--out");
  const skip = new Set(
    VALUE_FLAGS.map((f) => args.indexOf(f))
      .filter((i) => i >= 0)
      .flatMap((i) => [i, i + 1]),
  );
  const [game, file] = args.filter((_, i) => !skip.has(i));
  if (!game || !file) {
    console.error("usage: recipe:import <game> <file.png> [--frame <name>] [--out <recipe file>]");
    console.error(
      "       recipe:import <game> <grid.txt> --frame <name> [--grid-frame <name>] [--width <w>] [--height <h>] [--out <recipe file>]",
    );
    process.exit(2);
  }
  const config = gameConfig(game);
  let text: string;
  if (file.toLowerCase().endsWith(".txt")) {
    if (!frameFlag) throw new Error("a grid.txt import needs --frame <name>, the new recipe's frame name");
    const gridFrame = flag("--grid-frame");
    const width = size("--width");
    const height = size("--height");
    const grid = readGridText(config, readFileSync(resolve(cwd, file), "utf8"), {
      ...(gridFrame === undefined ? {} : { frame: gridFrame }),
      ...(width === undefined ? {} : { width }),
      ...(height === undefined ? {} : { height }),
    });
    const types = resolve(recipeSrcDir(config), "types");
    // Where the file goes: `--out`, or its place in the game, `<src>/assets/<frame>.ts`.
    const target = out ? resolve(cwd, out) : resolve(recipeSrcDir(config), "assets", ...frameFlag.split("/")) + ".ts";
    let typesImport = relative(dirname(target), types).split(sep).join("/");
    if (!typesImport.startsWith(".")) typesImport = `./${typesImport}`;
    text = recipeSource({
      name: frameFlag,
      grid,
      typesImport,
      comment: `Drawn by sprite-gen's pixel-draw and imported from its grid.txt by recipe-import (corpus brief 13).`,
    });
  } else {
    text = importRecipe(config, frameFlag ?? frameOfPngName(file), readFileSync(resolve(cwd, file)));
  }
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
