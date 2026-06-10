import { type PixelRecipe } from "../../types";

// FILL — full-bleed seabed, used for interior cells. Edges are solid muted
// blue on all four sides so neighbouring fills join seamlessly; the surface is
// a gentle mottle of structure-blue (S/s) over deep ocean (V) with sparse
// stone lumps (Q) and one dull-gold polyp (o) so the mass has texture.
const recipe: PixelRecipe =
  {
    name: "tile/coral-fill",
    size: 16,
    pixels: [
      "SSSSSSSSSSSSSSSS",
      "SsSSSVSSSSVSSSsS",
      "SSSSSSSsSSSSSSSS",
      "SSVSSSSSSSSVSSQS",
      "SsSSSSQSSSSSSSSS",
      "SSSSSSSSSSsSSSSS",
      "SSSVSSSSSSSSSVSS",
      "SSSSSSoSSSSSSSSS",
      "SSsSSSSSSSQSSSsS",
      "SSSSSVSSSSSSSSSS",
      "SQSSSSSSSsSSSSSS",
      "SSSSSSSSSSSSVSSS",
      "SSSVSSSsSSSSSSQS",
      "SsSSSSSSSSVSSSSS",
      "SSSSQSSSSSSSSSsS",
      "SSSSSSSSSSSSSSSS",
    ],
  }
;

export default recipe;
