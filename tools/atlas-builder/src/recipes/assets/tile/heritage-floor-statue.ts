import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // heritage-floor-statue — weathered pale flagstone with sparse lichen.
    // s = steel blue-grey (#8b9bb4, EDG steel), S = slate (#5a6988, EDG slate),
    // q = stone light (#c0cbdc), e = lichen-blue highlight (#0099db, EDG skyBlue).
    // Large pale slabs (s/q) with thin slate grout (S) and a few lichen dots (e)
    // so it reads as old tended stone — paler and calmer than the ruin floor.
    name: "tile/heritage-floor-statue",
    size: 16,
    pixels: [
      "ssssssssSssssssS",
      "ssqsssssSssqsssS",
      "ssssssssSssssssS",
      "SSSSSSSSSSSSSSSS",
      "sssesssSssssssss",
      "sssssssSSsssssss",
      "ssssssssSssessss",
      "SSSSSSSSSSSSSSSS",
      "ssssssssSssssssS",
      "ssqsssssSssqsssS",
      "ssssssssSssssssS",
      "SSSSSSSSSSSSSSSS",
      "ssssssssSsssssss",
      "sssessssSSssssss",
      "ssssssssSsssesss",
      "SSSSSSSSSSSSSSSS",
    ],
  }
;

export default recipe;
