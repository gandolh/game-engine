# Engine brief 19 — engine audio subsystem (+ prove it in both games)

status: todo (dispatch-ready)
source: [todos/2026-07-08-engine-audio-subsystem.md](../../../todos/2026-07-08-engine-audio-subsystem.md) — that todo is the problem statement + design constraints + acceptance; this brief adds the dispatch-ready execution plan (shared API contract, three chunks, model routing, waves, gates). Routed via `orchestrate` 2026-07-08; user approved the plan and deferred execution to a later session.

## Summary

Add a **generic engine audio subsystem** (`@engine/core/audio`) and prove it end-to-end with
**2-3 test sounds wired into each game** (Farm Valley + Citadel). This is plumbing validation,
not the full sound design — enough to confirm the unlock→play→master-gain path works from real
snapshot events. Full per-event sound palettes come later.

**Decided in routing (do not relitigate):**
- **Procedural synth for v1 test sounds** — the engine synthesizes short oscillator
  blips/chimes/alarms at runtime, so we commit **zero binary audio assets** (no licensing/asset
  churn) while still exercising the whole pipeline. The buffer/file playback API is built too
  (for future real assets) but need not be wired to a committed `.wav` in this brief.
- Audio is a **client/render concern, strictly OFF the deterministic sim path** — same layer as
  particles/toasts/juice. **No `sim-core` is touched.** The engine is game-agnostic (no game
  names); each game owns its own event→sound map.
- Browsers start an `AudioContext` **suspended** until a user gesture → the engine exposes
  `unlock()`; clients call it on first pointer/key. jsdom has no Web Audio → the engine takes an
  **injected context factory** so its logic is unit-testable headlessly.

## Shared API contract (Chunk A defines; B + C consume)

```ts
// @engine/core/audio
type SoundSpec =
  | { kind: "synth"; osc: OscillatorType; freq: number; durationMs: number;
      gain?: number; sweepToFreq?: number; arpeggio?: number[] }   // procedural (v1)
  | { kind: "buffer"; buffer: AudioBuffer };                       // future real assets

interface AudioContextLike {            // the narrow subset the engine uses (so a fake is trivial)
  readonly state: "suspended" | "running" | "closed";
  resume(): Promise<void>;
  readonly currentTime: number;
  readonly destination: AudioNode;
  createGain(): GainNode;
  createOscillator(): OscillatorNode;
  createBufferSource(): AudioBufferSourceNode;
}

class AudioEngine {
  constructor(opts?: { contextFactory?: () => AudioContextLike; masterVolume?: number; maxVoices?: number });
  register(id: string, spec: SoundSpec): void;
  play(id: string, opts?: { gain?: number; pitch?: number }): boolean; // false if muted/locked/saturated/unknown
  unlock(): Promise<void>;              // resume() the context; call on first gesture
  get unlocked(): boolean;
  volume: number;                       // 0..1, scales master gain
  muted: boolean;
}
```

Signal chain: per-voice source → per-voice gain → **master gain** → `destination`. `muted`/`volume`
gate at the master gain. Voice cap (`maxVoices`, default ~16) skips or stops-oldest when saturated.
Pre-unlock `play()` is a **safe no-op returning false** (never throws).

## Chunks + model routing

Routing (per [routing.md](../../../routing.md)): controller/verify = **opus**; executors = **Sonnet 5**;
reserve the senior seat for the genuinely novel/risky foundation.

### Chunk A — engine audio subsystem · **senior (opus)** · Wave 1
- **Files:** new `engine/core/src/audio/{audio-engine.ts, types.ts, index.ts}`; add
  `"./audio": "./src/audio/index.ts"` to [engine/core/package.json](../../../../engine/core/package.json)
  `exports` (mirroring `/render`, `/input`, …).
- **Build** the `AudioEngine` above: master GainNode→destination; `play()` builds a per-voice
  oscillator (synth spec) or buffer source (buffer spec) → per-voice gain → master; voice cap;
  `unlock()` resumes a suspended ctx; pre-unlock `play` no-ops (false); `muted`/`volume` gate at
  master. Default `contextFactory = () => new AudioContext()`; a guarded feature-detect so a
  no-Web-Audio environment degrades to a silent stub rather than throwing at construction.
- **Tests** (`audio-engine.test.ts` with a hand-rolled `FakeAudioContext` implementing
  `AudioContextLike`, recording created nodes / gain values / `connect()` calls):
  register→`play` creates a source wired through the master gain; `muted` ⇒ `play` returns false
  and creates no source; `volume` scales the master gain value; **voice cap** enforced past N;
  **pre-unlock `play` is a safe no-op** (false, no throw, no node); `unlock()` drives
  `state`→"running". Prefer red-before-green where practical.
- **Gate:** `npm run typecheck` + `npm run test -w @engine/core`. Engine imports no game.

### Chunk B — Farm Valley wiring · junior (Sonnet 5) · Wave 2 (depends on A)
- **Hook:** Farm's client already diffs newly-appended `SnapshotEvent[]` (`.text`/`.drama`/
  `.farmerId`) via a `lastEventCount` cursor in
  [juice.ts](../../../../games/farm/client/src/main/juice.ts) `JuiceLayer.update`, driven from
  [render-loop.ts](../../../../games/farm/client/src/main/render-loop.ts). Play sound from the
  **same new-events pass** — do NOT re-diff independently; feed each new `ev` to the audio layer.
- **Files:** new `games/farm/client/src/main/audio.ts` (`FarmAudio` wrapping `AudioEngine` + a
  Farm event→SoundSpec map). **3 sounds**, matched off `ev.text` reusing juice.ts's existing
  matchers: (1) gold/trade `(\d+g)` → coin blip; (2) `"overtakes …for 1st"` / `"wins with a"` →
  rising arpeggio; (3) `"Drought!"` / `"missed a harbor contract"` → low buzz.
- **Unlock** on first pointer/key (one-shot listener near the client's global input in
  [main.ts](../../../../games/farm/client/src/main.ts)); **mute** via the existing settings/playback
  surface if cheap, else a programmatic setter + one key.
- **Gate:** typecheck + `npm run test`; **`CHECK_DETERMINISM=1 npm run sim` byte-identical** (the
  proof audio didn't leak into the sim — no sim-core touched).

### Chunk C — Citadel wiring · junior (Sonnet 5) · Wave 2 (depends on A)
- **Hook:** [main.ts](../../../../games/citadel/client/src/main.ts) already runs
  `for (const e of newEventsSince(lastEventShown, events)) toasts.push(e, …)`. Add
  `citadelAudio.onEvent(e)` in that same loop.
- **Files:** new `games/citadel/client/src/ui/audio.ts` (`CitadelAudio` + event→SoundSpec map).
  **3 sounds** keyed off the existing `toneOf(msg)` in
  [toast.ts](../../../../games/citadel/client/src/ui/toast.ts): `danger`→alarm pulse, `good`→chime,
  `warn`/`info`→soft tick. (Tone reuse guarantees coverage without guessing event strings.)
- **Unlock** on first gesture (Citadel's global pointer handlers in main.ts); **mute toggle** as an
  `@engine/ui` checkbox in the existing
  [settings-modal.ts](../../../../games/citadel/client/src/ui/settings-modal.ts) (EDG32 colours).
- **Gate:** typecheck + `npm run test`; **Citadel determinism run byte-identical**.

## Dispatch shape

Wave 1: **A alone** (opus). On green → Wave 2: **B + C in parallel** (Sonnet) — different client
packages, no file collisions, only the `@engine/core/audio` contract shared. Controller runs the
per-wave gates + `/code-review` over the full diff, then closeout: `log.md` + fold a short **audio**
note into [wiki/architecture.md](../../../wiki/architecture.md) (new off-sim client subsystem, the
unlock rule, the "never in sim-core" rule), move the source todo → `todos/closed/`. **Owed:** a
real-browser audio sign-off (a code-only session can't hear it) — capture it as the last acceptance
check, not a blocker for the code landing.

## Acceptance (from the source todo)

- All-workspace `npm run typecheck` + `npm run test` green; new `@engine/core` audio tests
  (stubbed context) cover registration, master-gain routing, mute/volume gating, voice cap, and
  pre-unlock no-op.
- **Zero `sim-core` changes**; Farm `CHECK_DETERMINISM` + Citadel determinism byte-identical.
- Live: after one click, each of the chosen 2-3 events per game produces a distinct audible sound;
  muting silences them; no autoplay-gate console errors.
- Engine never imports a game; the games never import each other; audio lives only in client
  packages.
