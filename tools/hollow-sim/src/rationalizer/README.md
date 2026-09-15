# The real Claude-backed `Rationalizer` (hollow-13, chunk 4)

`claude-rationalizer.ts` implements `@hollow/sim-core/rationalize`'s `Rationalizer`
interface against the real Anthropic API. It is **not wired into `npm run sim:hollow`
by this chunk** — a later controller pass does that. Until then, use it manually as
described here.

## This costs real money

Every consultation is a billed Claude API call (default model `claude-haiku-4-5`,
configurable to `claude-sonnet-5`). A run with the seam ON makes one call per
significant social decision the sim's policy gate (`rationalize/policy.ts`)
flags, for however many ticks the run lasts — nothing in this file cost-limits a
run beyond `maxInFlight` (bounds concurrency, not total spend) and the seam's own
timeout. **Do not wire this into CI, a loop, or an unattended long run.** Start
with a short run (few hundred ticks, small population) and watch the bill.

## Prerequisites

- An Anthropic API key with billing enabled, exported as `ANTHROPIC_API_KEY` (or
  another env var name — see `apiKeyEnvVar` below).
- Chunk hollow-13's other pieces already in the tree: the seam (`seam.ts`), the
  stub (`stub.ts`), and `HollowSimOptions.rationalizer` in `@hollow/sim-core`.

## Manual exercise (no CI, no automated test touches this)

There is currently no CLI flag wired to this provider (that's the controller's
job — see this chunk's task handoff). To exercise it by hand, write a small
throwaway script alongside the CLI, e.g. `tools/hollow-sim/scratch-live-run.ts`
(delete it afterward — it is not part of the package):

```ts
import { createClaudeRationalizerFromEnv } from "./src/rationalizer/claude-rationalizer";
import { runResearch } from "./src/run-core";
import { buildSimOptions } from "./src/env";

const rationalizer = createClaudeRationalizerFromEnv(); // reads ANTHROPIC_API_KEY
if (rationalizer === null) {
  console.error("ANTHROPIC_API_KEY is not set — nothing to exercise.");
  process.exit(1);
}

const simOptions = { ...buildSimOptions(), rationalizer };
const result = runResearch({ simOptions, ticksPerYear: 20, maxYears: 1 }); // KEEP THIS SHORT
console.log(`ran ${result.metricsRows.length} sampled tick(s); see events for rationale text`);
```

Run it with `ANTHROPIC_API_KEY=sk-ant-... npx tsx tools/hollow-sim/scratch-live-run.ts`
from the repo root. Keep `maxYears`/`ticksPerYear` small on the first pass — this
is a live, billed, non-deterministic run (the seam ON path is explicitly outside
the determinism contract; see the spec). Rationale strings adopted by the seam
show up in the chronicle/events export exactly like the stub's would.

## Configuration

`createClaudeRationalizerFromEnv(opts?)` — the factory to wire in:

| Option | Default | Notes |
|---|---|---|
| `apiKeyEnvVar` | `"ANTHROPIC_API_KEY"` | Absent/empty -> returns `null` (seam-off), never throws. |
| `model` | `"claude-haiku-4-5"` | Also accepts `"claude-sonnet-5"`, per spec. |
| `maxInFlight` | `4` | Provider-side concurrency cap. Over the cap, `submit` **drops** the request (an immediate `RationalizerResult.error`) rather than queueing — see the rationale in `claude-rationalizer.ts`'s file header. Independent of the seam's own population-wide cap (`DEFAULT_MAX_IN_FLIGHT = 8` in `@hollow/sim-core/rationalize`). |
| `timeoutMs` | `8000` | Per-request network timeout. |

`createClaudeRationalizer(opts)` is the lower-level constructor this factory
delegates to — it takes `apiKey` directly and **throws** on an empty one (a
caller reaching it has already decided to build a live provider, so a bad key is
a programming error, not an "off" state). Prefer the `FromEnv` factory unless you
already have a key in hand.

## Tests never touch the network

`claude-rationalizer.test.ts` mocks the `messages.create` call at the interface
Anthropic's client, and additionally stubs `globalThis.fetch` to throw if
anything in the file ever reaches it — a belt-and-suspenders guard against a
future test that forgets to inject a mock. `npm run test -w @tool/hollow-sim`
never calls the live API.
