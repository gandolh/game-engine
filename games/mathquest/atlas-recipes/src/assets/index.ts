import type { PixelRecipe } from "../types";
import hero from "./hero";
import balaur from "./enemy/balaur";
import capcaun from "./enemy/capcaun";
import dragon from "./enemy/dragon";
import muma from "./enemy/muma";
import strigoi from "./enemy/strigoi";
import varcolac from "./enemy/varcolac";

/** Every combat creature: the hero facing right, the enemies facing left. */
export const RECIPES: readonly PixelRecipe[] = [hero, dragon, balaur, strigoi, varcolac, capcaun, muma];
