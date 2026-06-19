import { type PixelRecipe } from "../../types";

// Upright, at-rest watering can for the CARRIED-tool overlay (brief 89 Phase A). The hotbar
// icon `tool/can` is drawn mid-pour (angled spout + water drops), which reads wrong when simply
// held — this compact upright variant sits in the hand instead. Drawn small/centred.
const recipe: PixelRecipe = {
  name: "tool/can-held",
  size: 16,
  pixels: [
    "................",
    "................",
    "................",
    ".......kkk......",
    "......k...k.....",
    ".....kSSSSSk....",
    "...kqkSssssk....",
    "..kqSSsssssk....",
    "...kSssssssk....",
    "...kSssssssk....",
    "...kSSSSSSSk....",
    "...kkkkkkkkk....",
    "................",
    "................",
    "................",
    "................",
  ],
};

export default recipe;
