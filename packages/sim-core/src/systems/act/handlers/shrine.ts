
import { maxApForDay, SHRINE_AP_BOOST, SHRINE_COOLDOWN_DAYS } from "../../ap";
import { SHRINE_REGION_ID } from "../../../world/regions";
import type { ActingFarmer } from "../types";

export function handlePrayAtShrine(farmer: ActingFarmer, day: number): void {
  if (!farmer.farmer || !farmer.ap) return;
  if (farmer.farmer.currentRegion !== SHRINE_REGION_ID) return;
  const last = farmer.farmer.shrinePrayedDay;
  if (last !== undefined && day - last < SHRINE_COOLDOWN_DAYS) return;

  const cap = maxApForDay(day);
  farmer.ap.current = Math.min(farmer.ap.current + SHRINE_AP_BOOST, cap);
  farmer.farmer.shrinePrayedDay = day;
}
