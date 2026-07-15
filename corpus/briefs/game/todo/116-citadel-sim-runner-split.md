# Brief 116 — Split `tools/citadel-sim`'s 1,196-line `index.ts` to mirror run-sim's layout

status: todo
source: 2026-07-15 wide structure survey. [tools/citadel-sim/src/index.ts](../../../../tools/citadel-sim/src/index.ts)
is one 1,196-line file doing everything Farm's runner does with a clean module split
([tools/run-sim/src/](../../../../tools/run-sim/src/): `env.ts`, `format.ts`, `report.ts`,
`run-core.ts`, `determinism.ts`/`determinism-worker.ts`, thin `index.ts`).

## Context

The two headless runners are siblings by design — Wave 2.5 (2026-07-11) already gave them a
shared generic `RunReport` envelope in `@engine/core/sim` behind symmetric `REPORT=1`/
`REPORT_FILE=` flags. The Citadel runner also owns the named scenarios (`grow`, `starve`,
`sack`, the fire/disease comparison pairs) and `sack`'s exit-1-on-failure contract — all
currently interleaved in the monolith.

## Scope

1. Split `tools/citadel-sim/src/index.ts` into modules mirroring run-sim's names where a
   counterpart exists (`env.ts` flag parsing, `format.ts` output, `report.ts` RunReport
   collection, `run-core.ts` the tick loop, `determinism.ts`) plus a Citadel-specific
   `scenarios.ts` (or `scenarios/` if it earns a directory). `index.ts` becomes the thin entry.
2. Pure mechanical extraction — no logic, flag, output, or scenario change of any kind.

## Constraints

- **Byte-identical stdout is the gate, not eyeballing:** capture `npm run sim:citadel` output on
  3 seeds and on the `grow` + `sack` + `starve` scenarios against pre-change `main`, and diff.
  Wave 2.5 set this precedent and the no-timestamps contract makes it possible.
- `sack` must still **exit 1 on failure** (that contract was restored deliberately 2026-07-11 —
  do not lose it in the shuffle).
- Sharing more code with run-sim (beyond the existing `RunReport`) is **out of scope** — note
  candidates at closeout instead of building them.

## Acceptance

- `index.ts` is a thin entry; no module exceeds ~450 lines; `npm run typecheck` 0; full suite
  green.
- Stdout byte-identical to pre-change `main` on 3 seeds + the 3 named scenarios; Citadel
  determinism double-run MATCH; `sack` failure path still exits 1 (prove with a forced-fail run
  or the existing test if one covers it).
