/**
 * Pull the CC0 iso reference packs into `inspirations/downloads/` (git-ignored)
 * for LOCAL study only. Nothing here enters the Citadel build — the art is
 * procedural + palette-guarded to EDG32 (see CREDITS.md). Run:  node inspirations/fetch.mjs
 *
 * These are landing PAGES, not direct binaries: itch.io / OpenGameArt / Kenney gate
 * downloads behind a click or a per-asset page, so this script can't blindly curl a
 * zip. It (1) writes an index of the sources and (2) opens each page in the browser
 * so you can grab the CC0 pack yourself, then drop the extracted PNGs under
 * downloads/<slug>/. Any *directly* hotlinkable previews we CAN fetch are pulled.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "downloads");
mkdirSync(OUT, { recursive: true });

/** CC0 reference packs — landing pages (grab the pack, drop PNGs in downloads/<slug>/). */
const SOURCES = [
  { slug: "screaming-brain-iso-town", license: "CC0", url: "https://screamingbrainstudios.itch.io/iso-town-pack",
    study: "coherent town; per-building silhouette + personality props" },
  { slug: "opengameart-cc0-isometric", license: "CC0 (verify per-asset)", url: "https://opengameart.org/content/cc0-isometric",
    study: "breadth of iso building silhouettes; roof/height/footprint variety" },
  { slug: "kenney-isometric", license: "CC0", url: "https://kenney.nl/assets/category:2D?search=isometric",
    study: "clean legible iso volumes; large building vocabulary; committed light" },
];

/** Tutorial pages — study only (no assets to download). */
const TUTORIALS = [
  "https://www.slynyrd.com/blog/2022/11/28/pixelblog-41-isometric-pixel-art",
  "https://www.slynyrd.com/blog/2025/1/23/pixelblog-54-isometric-pixel-art",
  "https://pixelparmesan.com/blog/fundamentals-of-isometric-pixel-art",
  "https://thebookofshaders.com/13/",
];

for (const s of SOURCES) mkdirSync(join(OUT, s.slug), { recursive: true });

writeFileSync(join(OUT, "SOURCES.json"), JSON.stringify({ packs: SOURCES, tutorials: TUTORIALS }, null, 2));

console.log("Reference sources written to inspirations/downloads/SOURCES.json");
console.log("These are CC0 landing pages — open each, download the pack, and extract PNGs into:");
for (const s of SOURCES) console.log(`  inspirations/downloads/${s.slug}/   ←  ${s.url}  [${s.license}]`);
console.log("\nTutorials (study only):");
for (const t of TUTORIALS) console.log(`  ${t}`);
console.log("\nNOTE: downloads/ is git-ignored. Nothing here ships — hand-translate forms to EDG32 recipes.");
