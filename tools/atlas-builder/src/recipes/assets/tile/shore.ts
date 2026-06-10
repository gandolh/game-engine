import { type PixelRecipe } from "../../types";

const recipe: PixelRecipe =
  {
    // Shore — a foam + wet-sand band along the TOP edge of the tile. Placed on a
    // LAND tile that borders ocean and rotated (0/90/180/270) so the band faces
    // the adjacent water. Transparent elsewhere so the land tile shows through.
    // w=white foam, e=ocean highlight, T/W=wet sand.
    name: "tile/shore",
    size: 16,
    pixels: [
      "wwwwwwwwwwwwwwww",
      "wewwewwwewwwewww",
      "TTwTTTwTTTTwTTTT",
      "TTTTTTTTTTTTTTTT",
      "WTTWTTTTWTTTWTTT",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
      "................",
    ],
  }
;

export default recipe;
