# Brief 108 — Citadel live-MP verification pass

status: todo (verification-first; fixes only for what the pass turns up)
source: the never-verified-live items — [wiki/status.md](../../../wiki/status.md) 2026-06-26 entry (citadel-38 "P1#6/#7/#9 social-layer/RunRegistry/MP-render still need live-MP verification"), [todos/2026-06-18-citadel-00-BUILD-ORDER.md](../../../todos/2026-06-18-citadel-00-BUILD-ORDER.md) items 21/22 (windowed-bake GPU-runtime verification LEFT OPEN), and [2026-07-02 review findings item 35](../../../todos/2026-07-02-full-repo-review-findings.md) (MP render window mixes iso and axis-aligned space — worse than its in-code "deferred" comment implies).

## Setup

`npm run citadel`, open two real-browser tabs on `?mp` (same room), real GPU. Drive both
via the `window.__citadel` dev hook where scripted steps help. ⚠️ Run AFTER brief 97
(chunk 5 fixes MP pause/speed authority — verifying before it lands would just re-find
that known bug).

## Checklist

1. **RunRegistry / room lifecycle**: join, late-join replay, owner handoff on owner leave,
   both tabs closing → room reaps; a third tab re-joining a reaped key gets a fresh run.
2. **MP render**: rival buildings/villagers/raiders render correctly on both clients;
   verify against brief 105's owner-filter finding (rival crowd currently indistinguishable).
3. **Social/threat layer under MP** (citadel-38 P1#6): threats + events attribute to the
   right player on both screens.
4. **Windowed bake on the large MP world** (items 21/22): pan far from center on both
   tabs; watch for the iso-vs-axis window drift (findings item 35) — capture concrete
   repro coordinates if it bites. If it does, fix or file the iso-correct windowing as the
   follow-up it's been deferred as.
5. **Incremental build queue under GPU runtime** (item 22's other half): heavy building
   spam doesn't hitch either client.

## Closeout

Each item verified-or-filed; the 2026-06-18 BUILD-ORDER todo gets its residual items
resolved and moves to closed; status.md's "still need live-MP verification" line cleared.
