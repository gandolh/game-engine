> **CLOSED unbuilt 2026-07-15.** The verification session was never run and is no
> longer queued as scheduled work. The underlying eyeball debt is still recorded on
> the source briefs and the status.md "Pending" banner; run it opportunistically at
> a real GPU, or refile if it needs to be a tracked task again.

# Brief 107 — Farm visual verification session (clear the eyeball debt)

status: todo (one interactive session with the user's real GPU; nothing to build unless a check fails)
source: pending flags in [wiki/status.md](../../../wiki/status.md) ("⚠️ Pending: an in-browser visual pass over 12–16/86/87") + [wiki/animation.md](../../../wiki/animation.md) (brief-85 feel-check) + [todos/2026-07-01-citadel-phaseA-playtest-verification.md](../../../todos/closed/2026-07-01-citadel-phaseA-playtest-verification.md) (warm-glow contrast).

## Checklist (run `npm run dev`, real GPU, `?profile` available)

1. **Shader wave 12–16** (per the done-brief acceptance lists): day/night GPU tint; living
   water (tiling break, shore foam, caustics); weather parity (round snow, rain tails,
   star); fBm cloud shadows scaling sunny→storm; crop/tree wind sway + bridge rope sway.
2. **Brief 86 juice**: gold popups, trauma shake (≤3px, positive beats), hitstop,
   leaderboard score-bump — ⚠️ run AFTER brief 97 lands (the juice event-diff bug currently
   kills these after ~30 events; verifying before the fix would false-fail).
3. **Brief 87 restyle**: home 32×48 + forge-house chimney anchor.
4. **Brief 85 animation feel**: walk swing + stride cadence on farmers/Pip; the pixel-snap
   softening caveat (animation.md) — if it shimmers, file the opt-in no-snap follow-up.
5. **Citadel Phase-A warm-glow contrast**: place services on a thriving town so house mood
   climbs 40→80; confirm the glow/dim contrast frames "thriving vs neglected"
   (playtest-citadel can drive it).

## Closeout

Each pass/fail noted against its source brief; failures become todos; the status.md
"Pending" banner and the phaseA todo get cleared/annotated. Nothing here changes code.
