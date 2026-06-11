import { type PixelRecipe } from "../../types";

// Compact stone/wood weather-station building: ~3×2 tiles (48×32 px).
// Top-left light direction: lighter upper-left (q/s), shadow bottom-right (N).
// Two windows (kSSk-framed) and a central door (kDDk).
const recipe: PixelRecipe = {
  name: "structure/weather-station",
  size: 32,
  width: 48,
  height: 32,
  pixels: [
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
    "QqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqQ",
    "QqQssssssssssssssssssssssssssssssssssssssssssQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSsQqQ",
    "QqQsSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSNsQqQ",
    "QqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqQ",
    "QqDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDqQ",
    "QqDdddddddddddddddddddddddddddddddddddddddddddqQ",
    "QqDddkkkkddddddddddddddddddddddddddddddkkkkdddqQ",
    "QqDddkSSkddddddddddddddddddddddddddddddkSSkdddqQ",
    "QqDddkSSkddddddddddddddddddddddddddddddkSSkdddqQ",
    "QqDddkSSkddddddddddddddddddddddddddddddkSSkdddqQ",
    "QqDddkkkkddddddddddddddddddddddddddddddkkkkdddqQ",
    "QqDdddddddddddddddddddddddddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddkDDkddddddddddddddddddddqQ",
    "QqDdddddddddddddddddddddddddddddddddddddddddddqQ",
    "QqDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDqQ",
    "QqQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQqQ",
    "QQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQ",
    "kQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQQk",
  ],
};

export default recipe;
