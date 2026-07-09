---
summary: Historical grading record for the Citadel art-04..07 wave — baseline, re-grade, and final PASS/CONDITIONAL/FAIL verdicts against the critique rubric.
updated: 2026-07-02
---

# Citadel — asset critique verdict record

The rubric these grades were scored against lives in
[citadel-asset-critique.md](citadel-asset-critique.md). This page is the **record**, kept for
provenance; re-grading a future art wave means appending here, not rewriting.

### Verdict record (fill at closeout)

```
Date:            <YYYY-MM-DD>
Judged from:     showcase-{noon,dusk,night,fire,isometry}.png + playtest run <seed/day>
Results:         A: _/5   B: _/5   C: _/5   D: _/4   E: _/4   F: _/6   G: _/5
❌ blockers:      <list or none>
⚠️ notes:         <list>
VERDICT:         PASS | CONDITIONAL | FAIL
```

### Baseline (2026-07-02, art-06 landed, pre art-04/05/07)

First grading, from the art-06 showcase captures — establishes what the following
briefs must fix (NOT a closeout verdict):

- **A1/A2 FAIL** — silhouette collapse confirmed at a glance: the fort family
  (watchpost/tower/garrison/keep) + quarry/mine read as near-identical featureless
  grey cubes; the cottage family (house/bakery/smith/healer/woodcutter/sawmill) reads
  as one box with different roof colours. → **art-04**.
- **F1 FAIL** — a burning building shows only the orange multiply-tint + dark soot
  wash; no flame / ember / glow — reads "tinted orange", not "on fire". → **art-07**.
- **A4 (units)** — not yet gradeable (showcase places buildings only; add unit rows
  with art-05).
- **Passing at baseline:** C (spacing + base→apex isometry via the ruler overlay), B5
  (consistent UL sun), E1 (wash cycles dawn/noon/dusk/night), D1/D3 (warm ground,
  terrain tiers), G4 (palette guard green), G5 (403/403, reloads:0, no page errors).

**Baseline VERDICT: FAIL** (A1/A2/F1 blockers) — expected; the art-04/05/07 work
exists to clear them. Re-grade at closeout.

### Re-grade (2026-07-02, art-04 + art-07 landed)

From fresh showcase captures + the headless gates:

- **A1 PASS** — silhouette test green (all 21 building types provably distinct at
  GRID=48 pairwise mask distance). **A2 PASS** — browser confirms: round tower drum,
  sunken quarry pit, mono-pitch lean-to workshops, jettied healer, civic town-hall
  gable, mine headframe all read distinctly; the cottage/fort monocultures are broken.
- **B1/B2/B3 PASS** — depth test green (≥3 central-scan values); browser shows
  hue-shifted bands + ridge kiss.
- **C2 PASS** — isometry test green (base-width ≥ apex-band) + the showcase ruler
  overlay confirms base→apex read.
- **F1–F6 PASS** — burning buildings show a cozy flame + warm ground-glow (browser
  confirmed on every silhouette) + embers/fire-smoke particles; glow brighter at
  night; composes over the soot/orange cues; fire.test.ts green.
- **E1/E2 PASS** — wash cycles dawn/noon/dusk/night (gentle navy night, warm dusk);
  dusk `@lit` window glow visible.
- **G4/G5 PASS** — palette guard green; 414/414; showcase reloads:0, no page errors.

**Still open (own briefs, not regressions):** **A4/A5 units** — art-05 not yet done
(units still one re-tinted body); the showcase places buildings only. Minor ⚠️: a
couple of fort/civic silhouettes (keep vs garrison) still read boxy at gameplay zoom
though distinct per the test — art-04 polish candidate.

**Re-grade VERDICT: CONDITIONAL** — both baseline blockers (A1/A2, F1) cleared; the
only open headline item is A4 (units), which is art-05's scope. Buildings + fire are
"visually good." Full PASS awaits art-05.

### Final grade (2026-07-02, art-04 + art-05 + art-06 + art-07 all landed)

- **A4/A5 PASS** — art-05 landed: each of 9 gameplay roles gains a silhouette
  accessory (farmer hat+hoe, smith apron+hammer, priest/healer robe, soldier/watchman
  spear, trader pack, woodcutter/sawyer axe); `unit-silhouette.test.ts` proves each
  role adds opaque pixels OUTSIDE the base body mask AND the grey multiply-tint
  contract holds. Raider tiers already give 4 silhouettes by strength.
- All building/fire/depth/isometry/atmosphere items remain PASS (see re-grade above).
- **G4/G5 PASS** — palette guard green; **418/418**; showcase reloads:0, no page errors.
- Headless gates now standing: `silhouette.test.ts` (A/B/C), `unit-silhouette.test.ts`
  (A4/A5 + tint contract), `fire.test.ts` (F), `showcase.test.ts` (spacing) — so the
  rubric's core is regression-locked in CI, not just eyeballed.

**Minor ⚠️ (polish follow-ups, not blockers):** keep vs garrison still read a touch
boxy at far zoom (distinct per the GRID=48 test, subtle to the eye); the showcase
frames buildings large and crops the villager row — role silhouettes are best read in
a populated playtest / a future dedicated unit-sheet view.

**FINAL VERDICT: PASS** — zero ❌; the two baseline blockers cleared and every headline
item (A1/A2/A4/C2/F1/G1) green. The asset set is "visually good": ship it; the ⚠️ items
are logged as polish. (Re-run this rubric after any future recipe change.)
