# Game Task 31 — Corpus Index Sync + Register New Briefs

## Context

[corpus/index.md](../../../index.md) has drifted from reality. It still lists briefs **06, 16–22** under "todo" headers (`#### Engine — todo`, `#### Game — todo`), but those all shipped — they're in `done/` and [status.md](../../../wiki/status.md) correctly records *"todo/ is now empty — every brief has shipped."* index.md simply never caught up. Per [corpus/CLAUDE.md](../../../CLAUDE.md), the actual code/`done` state wins over a stale wiki/index page.

Additionally, a grilling session on 2026-06-03 produced **8 new todo briefs (24–31)** that need registering across the corpus.

## Goal

Bring the corpus navigation back in sync with reality and register the new work — one coherent corpus update.

## Tasks

1. **Fix `index.md` done/todo listings.** Move briefs 06 and 16–22 out of the "todo" sections into the done listings (engine 06 → Engine done; game 16–22 → Game done). After the fix, the only briefs under "todo" headers are the new ones below.
2. **Register the new briefs (24–31)** in `index.md` under the Game — todo (and Engine — todo if any) section:
   - 24 — Auction bidding + golden bean (fixes the "no winner" dead feature; adds gifting)
   - 25 — Panel overlap fix (observer/activity right-column)
   - 26 — Day/night + seasonal color grading (3a)
   - 27 — Long days + intra-day agent timeline (3b)
   - 28 — AP economy rework (3c)
   - 29 — Irrigation & crop death (3d)
   - 30 — Procedural ground texture (noise)
   - 31 — this brief
3. **Update [status.md](../../../wiki/status.md):** the "todo/ is empty" claim is no longer true — add a "Now in todo" section listing 24–31 with one-line status, and note the 3a/3b/3c/3d grouping and dependency chain (27 → 28 → 29; 26 ships with 27).
4. **Update [open-questions.md](../../../wiki/open-questions.md):** the auction "no winner" finding and the day/night → long-day → AP/irrigation redesign are now briefs, not open questions — record them as "now has a brief".
5. **Append a [log.md](../../../log.md) entry:** `## [2026-06-03] briefs | grilling session — 8 new todo briefs (24–31); auctions found dead-on-field, day/night idea expanded into long-day gameplay redesign`.

## Notes for whoever executes

- This is a **documentation-only** brief — no source changes.
- Keep markdown links relative from each page's own location (CLAUDE.md convention).
- Dates absolute.
- The dependency/sequencing facts to capture: 26 validated with 27; 28 requires 27; 29 requires 27 + 28; 24 and 25 are independent and can ship first.

## Acceptance

- `index.md` "todo" sections contain only briefs 24–31; 06 and 16–22 appear under done.
- status.md / open-questions.md / log.md reflect the new briefs and the auction finding.
- No source files changed.
