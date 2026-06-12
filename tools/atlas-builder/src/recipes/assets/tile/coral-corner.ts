import { type PixelRecipe } from "../../types";

// CORNER: authored top-left-open; computeCoral rotates it to face the open corner.
// The coral mass rounds off the top-left into TRANSPARENT water (`.`) — a curved
// convex corner, no hard tile rectangle — while the closed (bottom/right) sides
// stay solid coral so they join inward neighbours. Multi-hued to suit any fill.
const recipe: PixelRecipe =
  {
    name: "tile/coral-corner",
    size: 16,
    pixels: [
      "................",
      "................",
      "...........i....",
      "..........oo....",
      ".........ooooo..",
      "......i..oooooU.",
      ".....oooooooUUUU",
      "....ooooooUUUUUf",
      "...ooooofUUUUfff",
      "..ooooffUUUfffff",
      ".oooffffffffRRff",
      "ooofffffffRRRRRf",
      "oofyyfffRRRRxRRR",
      "ofyyffRRRRRRRRRR",
      "oyRRRRRRRRRRNRRR",
      "oNRRRRRRRRRRRRRR",
    ],
  }
;

export default recipe;
