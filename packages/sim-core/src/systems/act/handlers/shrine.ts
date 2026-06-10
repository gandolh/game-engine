/**
 * brief 50 — pray at the interactive shrine island.
 *
 * A region-gated, cooldown-gated, bounded AP top-up. Region-gated: only resolves
 * when the farmer is standing ON the shrine region (off-region ⇒ no-op, the intent
 * is dropped). Cooldown-gated: once per SHRINE_COOLDOWN_DAYS per farmer, tracked
 * by `shrinePrayedDay`. Bounded: grants SHRINE_AP_BOOST AP, ALWAYS clamped to
 * `maxApForDay(day)` so it can never push a farmer past a normal full day's
 * ceiling (so it can't snowball a leader — see project_leader_runaway).
 *
 * Pure function of sim state: no RNG, no Math.random/Date.now.
 */
import { maxApForDay, SHRINE_AP_BOOST, SHRINE_COOLDOWN_DAYS } from "../../ap";
import { SHRINE_REGION_ID } from "../../../world/regions";
import type { ActingFarmer } from "../types";

export function handlePrayAtShrine(farmer: ActingFarmer, day: number): void {
  if (!farmer.farmer || !farmer.ap) return;
  // Region-gated: must be standing on the shrine.
  if (farmer.farmer.currentRegion !== SHRINE_REGION_ID) return;
  // Cooldown-gated: refuse if prayed within the last SHRINE_COOLDOWN_DAYS days.
  const last = farmer.farmer.shrinePrayedDay;
  if (last !== undefined && day - last < SHRINE_COOLDOWN_DAYS) return;

  // Bounded AP top-up, clamped to the day's ceiling.
  const cap = maxApForDay(day);
  farmer.ap.current = Math.min(farmer.ap.current + SHRINE_AP_BOOST, cap);
  farmer.farmer.shrinePrayedDay = day;
}
