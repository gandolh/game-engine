import { type PixelRecipe } from "../../types";

// tile/coral-reef — the FISHABLE reef marker. Brighter and richer than the
// background decorative tile/coral-* tiles so the reef reads as a distinct
// "go here to fish" location. Ocean base (V/v), vivid gold polyps (o),
// red coral branches (r), bright foam highlights (e/w), stone lumps (Q)
// for texture. Full-bleed so it tiles cleanly with the ocean around it.
const recipe: PixelRecipe =
  {
    name: "tile/coral-reef",
    size: 16,
    pixels: [
      "VVVeVVVVVVeVVVVV",
      "VVVVVVVeVVVVVVVV",
      "VeVVVrVVVVVrVVeV",
      "VVVVrrrrVVrrrrVV",
      "VVVrroorrVoorrVV",
      "VVVrrooorroorvVV",
      "VeVVrroooorrvVeV",
      "VVVVrroooorrVVVV",
      "VVVVVrroorrVVVVV",
      "VVeVVVrrrrVVeVVV",
      "VVVVVVVrrVVVVVVV",
      "VVVVVVoooVVVVVVV",
      "VVVeVoooooVeVVVV",
      "VVVVVowoooVVVVVV",
      "VVVVVVoooVVVVVVV",
      "VVVeVVVVVVeVVVVV",
    ],
  }
;

export default recipe;
