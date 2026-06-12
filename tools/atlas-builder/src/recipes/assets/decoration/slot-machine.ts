import { type PixelRecipe } from "../../types";

// Tall arcade slot cabinet, 1×2 tiles (16×32), bottom-anchored.
// Blue structure body (S/s), gold trim (o), lit reel window (y/o/i),
// red lever on the right (r), coin tray at the base.
const recipe: PixelRecipe = {
  name: "decoration/slot-machine",
  size: 16,
  width: 16,
  height: 32,
  pixels: [
    "................",
    "................",
    "................",
    "....kkkkkk......",
    "...koooooook....",
    "...koyyyyyok....",
    "...koyiyiyok....",
    "...kooooooook...",
    "..ksSSSSSSSsk...",
    "..kSssssssSSk...",
    "..kSskkkkksSk...",
    "..kSskoyoksSkk..",
    "..kSskyiyksSkrk.",
    "..kSskoyoksSkrk.",
    "..kSskkkkksSkok.",
    "..kSssssssSSkk..",
    "..kSsSSSSSsSSk..",
    "..kSskooooksSk..",
    "..kSskoSSoksSk..",
    "..kSskoSSoksSk..",
    "..kSskooooksSk..",
    "..kSssssssSSSk..",
    "..kSSSSSSSSSSk..",
    "..kSswwwwssSSk..",
    "..kSswooowssSk..",
    "..kSswooowssSk..",
    "..kSswwwwssSSk..",
    "..kSSSSSSSSSSk..",
    "..kkkkkkkkkkkk..",
    "..kQQQQQQQQQQk..",
    "..kkkkkkkkkkkk..",
    "................",
  ],
};

export default recipe;
