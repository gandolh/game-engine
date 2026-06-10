import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // brief 50 — interactive shrine landmark: a ring of standing stones around a
    // dolmen (two upright megaliths capped by a dark lintel) with a small glowing
    // offering (gold/yellow) at its base and a grassy mound below. Reads as an
    // ancient sacred site distinct from every other structure. Stone light (q) /
    // dark (Q) for the megaliths, near-black (k) for the lintel + shadow seams,
    // gold (o) + yellow (y) for the offering glow, grass (G/c) for the mound.
    name: "structure/shrine",
    size: 16,
    pixels: [
      "................",
      "....kkkkkkkk....",
      "...kQQQQQQQQk...",
      "...kQqQQQQqQk...",
      "...QqQ....QqQ...",
      "...QqQ....QqQ...",
      "..q.QqQ..QqQ.q..",
      "..Q.QqQ..QqQ.Q..",
      "..q.QqQ..QqQ.q..",
      "...QqQ.yy.QqQ...",
      "...QqQ.oo.QqQ...",
      "..QqQ.yooy.QqQ..",
      "..QQQGooooGQQQ..",
      "...GGcGooGcGG...",
      "....cGGGGGGc....",
      "................",
    ],
  }
;

export default recipe;
