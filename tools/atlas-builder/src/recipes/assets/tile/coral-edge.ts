import { type PixelRecipe } from "../../types";

// EDGE: authored top-open; computeCoral rotates it to face open water. The coral
// mass rounds off and dissolves into TRANSPARENT water (`.`) toward the open
// (top) side — a curved, soft silhouette, no hard tile rectangle — while the
// closed sides stay solid coral so they join inward neighbours. Multi-hued so it
// reads well beside any fill variant.
const recipe: PixelRecipe =
  {
    name: "tile/coral-edge",
    size: 16,
    pixels: [
      "................",
      "................",
      "......ii........",
      "....PP...oo.....",
      "...PPPP.ooooo...",
      "..PPPPPooooooff.",
      ".PPPPPoooooofffR",
      "PPPPPoooooofffRR",
      "PPuPPoooooffRRRR",
      "PPPPPoooooffRRRR",
      "PPPPUooooRRRRRRR",
      "PPUUoooRRRRRRRRR",
      "PUUUyyRRRRxRRRRR",
      "UUUyyRRRRRRRRRRR",
      "UUyRRRRRRRRRRNRR",
      "UyRRRRRRRRRRRRRR",
    ],
  }
;

export default recipe;
