# Brief 15 (engine) — fBm cloud-shadow pass + mist sheet

Promoted from [wiki/shader-ideas.md](../../../wiki/shader-ideas.md) (ch. 13; first wave, item 5). **Depends on brief 12** (GPU wash) so clouds compose under the day/night tint.

## Why

Worldgen already trusts fBm + domain-warp aesthetically (brief 49, CPU-side) — this is its render-time sibling. Drifting cloud shadows are the single biggest "the world is alive" ambient signal for a zoomed-out spectator view, and the weather system can drive them (overcast days → more coverage), tying an existing sim signal to a visible effect for free.

## Tasks

1. **Cloud-shadow pass:** scrolling 3–4-octave fBm, `step()`-thresholded to soft blob masks, rendered as a low-alpha darkening pass over the world using the same pre-parsed EDG wash color as night. Quantized alpha (2–3 levels) to stay pixel-art friendly.
2. **Weather coupling (render-side only):** read the already-snapshotted weather state to scale coverage/drift speed. No new sim fields.
3. *(Optional follow-up, same machinery)* **fBm mist sheet:** domain-warped fBm at very low alpha over water regions / the waterfall as a gentler alternative to particle mist. Ship only if the cloud pass leaves obvious headroom.

## Acceptance

- Palette guard green; alpha-only modulation of a pre-parsed EDG uniform.
- Render-only / wall-clock — no determinism impact; drive time from one uniform.
- Manual in-browser check: clouds visibly drift at default zoom; sunny days are mostly clear; overcast/rain days are noticeably cloudier; night wash still reads correctly above the cloud darkening.
