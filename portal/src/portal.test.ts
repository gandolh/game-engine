import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { PNG } from "pngjs";
import { GAMES, gameById } from "./games";
import { routeOf, playPath } from "./route";
import { canPlayHere, MIN_HEIGHT, MIN_WIDTH, WARNING } from "./fit";
import { pixelTextBitmap } from "./pixel-text";
import { CARD_PALETTES } from "./card-palettes";

const PUBLIC = join(fileURLToPath(new URL(".", import.meta.url)), "..", "public");

describe("the game list", () => {
  it("is the four engine games, each with a unique id, its own path and a card", () => {
    expect(GAMES.map((g) => g.id)).toEqual(["farm-valley", "citadel", "hollow", "mathquest"]);
    expect(new Set(GAMES.map((g) => g.path)).size).toBe(4);
    for (const g of GAMES) {
      expect(g.path).toBe(`/${g.id}/`);
      expect(g.card).toBe(`cards/${g.id}.png`);
      expect(g.pitch.length).toBeGreaterThan(10);
      expect(g.description.length).toBeGreaterThan(g.pitch.length);
    }
  });

  it("names no host: every path is relative to the site", () => {
    for (const g of GAMES) expect(g.path.startsWith("/") && !g.path.startsWith("//")).toBe(true);
  });
});

describe("routing", () => {
  const farm = gameById("farm-valley")!;

  it("reads the grid and the play pages under the base", () => {
    expect(routeOf("/games/", "/games/")).toEqual({ kind: "grid" });
    expect(routeOf("/games", "/games/")).toEqual({ kind: "grid" });
    expect(routeOf("/games/index.html", "/games/")).toEqual({ kind: "grid" });
    expect(routeOf("/games/farm-valley/", "/games/")).toEqual({ kind: "play", game: farm });
    expect(routeOf("/games/farm-valley", "/games/")).toEqual({ kind: "play", game: farm });
    expect(routeOf("/farm-valley/", "/")).toEqual({ kind: "play", game: farm });
  });

  it("calls anything else missing", () => {
    expect(routeOf("/games/nope/", "/games/").kind).toBe("missing");
    expect(routeOf("/games/farm-valley/extra", "/games/").kind).toBe("missing");
    expect(routeOf("/elsewhere/", "/games/").kind).toBe("missing");
  });

  it("builds a play page's path from the base", () => {
    expect(playPath("/games/", farm)).toBe("/games/farm-valley/");
    expect(playPath("/", farm)).toBe("/farm-valley/");
  });
});

describe("the phone and tablet warning", () => {
  it("shows under 1280×640 for a game that doesn't play on phones, by screen size only", () => {
    expect([MIN_WIDTH, MIN_HEIGHT]).toEqual([1280, 640]);
    expect(canPlayHere(false, 1280, 640)).toBe(true);
    expect(canPlayHere(false, 1279, 640)).toBe(false);
    expect(canPlayHere(false, 1280, 639)).toBe(false);
    expect(canPlayHere(false, 412, 915)).toBe(false); // an Android phone
    expect(canPlayHere(false, 1366, 1024)).toBe(true); // a large tablet held sideways
  });

  it("never shows for a game that plays on phones, and says the owner's sentence", () => {
    expect(canPlayHere(true, 360, 640)).toBe(true);
    expect(WARNING).toBe("This game is unavailable for phones or tablets.");
  });
});

describe("pixel headings", () => {
  it("lay the display font out at 9 px per character, 16 px tall, with lit pixels", () => {
    const { width, height, lit } = pixelTextBitmap("Games");
    expect([width, height]).toEqual([5 * 9 - 1, 16]);
    expect(lit.reduce((a, b) => a + b, 0)).toBeGreaterThan(20);
  });
});

describe("card art", () => {
  for (const g of GAMES) {
    it(`${g.id}'s card is 4:3 and on its game's palette`, () => {
      const png = PNG.sync.read(readFileSync(join(PUBLIC, g.card)));
      expect(png.width * 3).toBe(png.height * 4);
      const palette = new Set((CARD_PALETTES[g.id] ?? []).map((c) => c.toLowerCase()));
      expect(palette.size).toBeGreaterThan(0);
      const off = new Set<string>();
      for (let i = 0; i < png.data.length; i += 4) {
        const hex = `#${[png.data[i]!, png.data[i + 1]!, png.data[i + 2]!].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
        if (!palette.has(hex)) off.add(hex);
      }
      expect([...off].slice(0, 5)).toEqual([]);
    });
  }
});
