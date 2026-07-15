
import { bootstrapSim } from "@farm/sim-core/sim-bootstrap";
import type { CropKind } from "@farm/sim-core/components";
import { makePathfinder } from "../pathfinder";

const SEED = 0xc0ffee;
const TICKS_PER_DAY = 20;
const MAX_DAYS = 100;
const SAMPLE_DAYS = new Set([10, 30, 60, 99]);
const CROPS: CropKind[] = ["radish", "wheat", "carrot", "tomato", "corn", "pumpkin", "grape", "winter-squash"];

async function main(): Promise<void> {
  const pathfinder = await makePathfinder();
  const { world, scheduler, dayClock } = bootstrapSim({
    seed: SEED,
    ticksPerDay: TICKS_PER_DAY,
    maxDays: MAX_DAYS,
    pathfinder,
  });

  const peakSingle: Record<string, number> = {};
  const peakWheatByKind: Record<string, number> = {};
  const surplusFarmerDays: Record<string, number> = {}; 
  let lastDay = -1;

  const totalTicks = MAX_DAYS * TICKS_PER_DAY;
  for (let tick = 0; tick < totalTicks; tick++) {
    scheduler.tick({ tick });
    if (dayClock.day === lastDay) continue;
    lastDay = dayClock.day;

    for (const f of world.query("farmer", "inventory")) {
      if (f.player) continue;
      const kind = f.personality?.kind ?? "?";
      const w = f.inventory!.crops["wheat"];
      if (w > (peakWheatByKind[kind] ?? 0)) peakWheatByKind[kind] = w;
      for (const crop of CROPS) {
        const n = f.inventory!.seeds[crop];
        if (n > (peakSingle[crop] ?? 0)) peakSingle[crop] = n;
        if (n >= 3) surplusFarmerDays[crop] = (surplusFarmerDays[crop] ?? 0) + 1;
        const ck = `CROP:${crop}`;
        const cn = f.inventory!.crops[crop];
        if (cn > (peakSingle[ck] ?? 0)) peakSingle[ck] = cn;
        if (cn >= 3) surplusFarmerDays[ck] = (surplusFarmerDays[ck] ?? 0) + 1;
      }
    }

    if (SAMPLE_DAYS.has(dayClock.day)) {
      console.log(`\n=== DAY ${dayClock.day} seed holdings (AI farmers, nonzero only) ===`);
      for (const f of world.query("farmer", "inventory")) {
        if (f.player) continue;
        const held = CROPS.map((c) => [c, f.inventory!.seeds[c]] as const).filter(([, n]) => n > 0);
        if (held.length === 0) continue;
        console.log(
          `  ${(f.farmer?.name ?? "?").padEnd(10)} ${(f.personality?.kind ?? "?").padEnd(12)} ` +
            held.map(([c, n]) => `${c}=${n}`).join(" "),
        );
      }
    }
  }

  console.log("\n=== PEAK SINGLE-FARMER SEED HOLDING (whole run) ===");
  for (const crop of CROPS) {
    console.log(
      `  ${crop.padEnd(14)} peak=${peakSingle[crop] ?? 0}  surplus(>=3)-farmer-days=${surplusFarmerDays[crop] ?? 0}`,
    );
  }
  console.log("\n=== PEAK SINGLE-FARMER HARVESTED-CROP HOLDING (whole run) ===");
  for (const crop of CROPS) {
    const ck = `CROP:${crop}`;
    console.log(
      `  ${crop.padEnd(14)} peak=${peakSingle[ck] ?? 0}  surplus(>=3)-farmer-days=${surplusFarmerDays[ck] ?? 0}`,
    );
  }
  console.log("\n=== PEAK WHEAT-CROP HOLDING BY PERSONALITY ===");
  for (const [k, v] of Object.entries(peakWheatByKind)) {
    console.log(`  ${k.padEnd(14)} peak wheat crops=${v}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
