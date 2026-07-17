import { ParticleSystem, createRng } from "@engine/core";
import { scaleTicks, RAIDER_MOVE_INTERVAL_TICKS } from "@citadel/sim-core";
import { CitadelSmoke, CitadelFire } from "../render/citadel-fx";
import { CitadelWeather } from "../render/weather";
import { CitadelAmbientCrowd } from "../render/ambient-crowd";
import { EntityInterpolator } from "../render/entity-interp";
import { TICKS_PER_DAY } from "./constants";

// Brief 25: render-feature toggles (all default ON), driven by the settings
// modal. Each gates its layer in render-loop.ts's loop() — purely cosmetic, zero sim impact.
// A single shared mutable object: settings.ts mutates its properties (never reassigns the
// `renderToggles` binding itself), render-loop.ts reads them.
export const renderToggles = {
  wash: true,        // day/night + seasonal wash (brief 15)
  clouds: true,      // fBm cloud-shadow + morning-haze overlay (art-03)
  lightPool: true,   // night light pool (brief 15)
  weather: true,     // weather particle FX (brief 16)
  ambientCrowd: true, // instanced ambient crowd (brief 18)
  smoke: true,       // chimney smoke (brief 17)
};

// Atmosphere (render-only, off-sim): day/night wash, weather FX, ambient crowd.
export const weather = new CitadelWeather();
export const ambientCrowd = new CitadelAmbientCrowd();

// Render-only entity position interpolation: glide villagers/raiders between
// snapshot tiles instead of snapping (units step one tile per sim tick). Driven
// by the measured interval between snapshot arrivals — ingested from sim-client.ts's
// onSnapshot handler, sampled from render-loop.ts's loop().
export const villagerInterp = new EntityInterpolator();
// Raiders step once every scaled MOVE_INTERVAL ticks (Challenge pacing), not every
// tick like villagers — passing that segment length (in snapshot intervals, since a
// snapshot is posted once per tick) switches positionOf to the long-segment forward
// glide (see entity-interp.ts's header) instead of the short jitter buffer, so a
// raider's step glides across its whole march instead of hopping at the very end of
// it. Derived (never hardcoded 180) from the sim's own constants so it stays correct
// if either MOVE_INTERVAL or the client's TICKS_PER_DAY ever change.
export const raiderInterp = new EntityInterpolator(scaleTicks(RAIDER_MOVE_INTERVAL_TICKS, TICKS_PER_DAY));

// Render-side juice (briefs 17 + 19). All off-sim:
//  - particles: chimney smoke, rendered by the WebGPU particle pass via endFrame
//  - fxRng: render-side RNG (seeded off a constant) for smoke jitter ONLY —
//    never the sim RNG, never Math.random in sim-construable code.
//  - appearAt: building-key → first-seen render-clock ms, for the placement ease.
export const particles = new ParticleSystem();
const fxRng = createRng(0x5117_c0de);
export const smoke = new CitadelSmoke(particles, fxRng);
// art-07: fire ember + fire-smoke emitter (its own render-side RNG fork so its
// jitter never perturbs the smoke emitter's stream). Render-only, off-sim.
export const fire = new CitadelFire(particles, createRng(0xf1_2e_00d5));
export const appearAt = new Map<string, number>();
//  - burningSince: building-key → render-clock ms a fire first started, so the
//    brief-24 soot overlay can ramp ("accumulate") while a building burns.
export const burningSince = new Map<string, number>();
