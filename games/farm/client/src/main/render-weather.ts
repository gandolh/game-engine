/**
 * Weather-particle spawning for the Farm render loop (audit-25 slice 1/4).
 *
 * Split out of `renderFrame`'s `frameProfiler.time("weather", ...)` block verbatim: translate the
 * current snapshot's season/condition into a {@link RainField} config (rain/snow, intensity, color)
 * and step it one frame, letting the field spawn ground-splash particles via `spawnRainSplash`.
 * Pure delegation to `rain` — no other render-loop state is touched, so this took explicit
 * parameters cleanly with no shared-mutable-state entanglement.
 */
import type { RainField, WeatherKind } from "@engine/core";
import { EDG } from "@engine/core";

/** The view-space bounds `RainField.update` culls spawns against (world px, camera-relative). */
export interface ViewBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** The subset of the snapshot's weather block this function reads. */
export interface WeatherInput {
  season?: string;
  condition?: string;
}

/**
 * Configure `rain`'s kind/intensity/color from `weather` and step it for `dt` seconds. Behavior is
 * unchanged from the original inline block: winter + wet → snow, wet (non-winter) → rain, storm
 * raises intensity, otherwise the field goes idle ("none").
 */
export function renderWeather(
  weather: WeatherInput | undefined,
  rain: RainField,
  view: ViewBounds,
  dt: number,
  spawnRainSplash: (wx: number, wy: number) => void,
): void {
  const isWinter = weather?.season === "winter";
  const isWet = weather?.condition === "rainy" || weather?.condition === "storm";
  const isStorm = weather?.condition === "storm";
  let kind: WeatherKind = "none";
  let intensity = 0;
  let color: string = EDG.skyBlue;
  if (isWet && isWinter) {
    kind = "snow"; intensity = isStorm ? 1.0 : 0.6; color = EDG.white;
  } else if (isWet) {
    kind = "rain"; intensity = isStorm ? 1.3 : 0.8; color = EDG.skyBlue;
  }
  rain.setConfig({ kind, intensity, color, alpha: kind === "snow" ? 0.85 : 0.5 });
  rain.update(dt, view, spawnRainSplash);
}
