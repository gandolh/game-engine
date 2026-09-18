# audit-49 — `admissionPolicy` is a votable norm that nothing consults

status: todo
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. The code documents its own deferral;
this brief is about closing it or being honest about it.

## The gap

Hollow's communities vote on three norms. Two of them steer behaviour:

- `shareRate` → [`governance-system.ts:506`](../../games/hollow/sim-core/src/governance/governance-system.ts#L506) (`expectedContribution`), `:569` (norm-clash)
- `cooperationExpectation` → [`governance-system.ts:490`](../../games/hollow/sim-core/src/governance/governance-system.ts#L490) (`cooperationMultiplier`)

The third does not. `grep -rnw admissionPolicy` over the whole repo returns **only writes and type
declarations** — `driftNorm` at [`governance-system.ts:465`](../../games/hollow/sim-core/src/governance/governance-system.ts#L465),
the default in [`registry.ts:49`](../../games/hollow/sim-core/src/community/registry.ts#L49), the
snapshot field at [`snapshot-builder.ts:129`](../../games/hollow/sim-core/src/snapshot-builder.ts#L129),
the interface at [`community.ts:52`](../../games/hollow/sim-core/src/community/community.ts#L52), the
constant, the protocol type, and a range assertion in the governance test. **Zero reads.**

[`community.ts:42-46`](../../games/hollow/sim-core/src/community/community.ts#L42-L46) says so itself:

> *"Purely a governance signal in this chunk (nothing in `crystallize-system.ts`'s GROW pass reads it
> yet — that would re-tune hollow-04's join-trust calibration ahead of a brief that actually wires the
> coupling)"*

That was a correct call at the time. This is the brief it names.

## Why it matters

The wiki and the in-app inspect panel advertise votable norms as
`shareRate`/`cooperation`/**`admission`**. A third of the mechanic is theatre: a community can vote
itself fully closed and still admit anyone. Hollow is described as a *research instrument* — a
researcher reading `NORM_CHANGED` events out of the chronicle would draw causal conclusions from a
number with no causal effect. That is worse than the feature being absent.

## The decision to make — do NOT just pick one

1. **Wire it into the GROW/join pass.** What the field was for. The comment names the cost honestly:
   it re-tunes hollow-04's join-trust calibration, so population dynamics move and every Hollow
   baseline shifts. Needs a measured before/after, not just a code change.
2. **Cut it.** Delete the norm, its snapshot field, its protocol member and its vote. Two working
   norms honestly beats three where one is decorative. Cheapest, and loses a designed-for axis.
3. **Keep it and label it.** Leave it as a pure signal and say so in
   [`wiki/hollow-overview.md`](../wiki/hollow-overview.md) and in the inspect panel — "voted, not yet
   binding". Honest, but a norm nobody obeys will confuse every future reader, and this is the option
   that silently becomes permanent.

Option 1 is the intended one. Do not start it without deciding what the join-trust re-tune is allowed
to do to the existing Hollow numbers.

## Files likely involved
- [`games/hollow/sim-core/src/community/crystallize-system.ts`](../../games/hollow/sim-core/src/community/crystallize-system.ts) — the GROW/join pass, the intended consumer
- [`games/hollow/sim-core/src/community/community.ts`](../../games/hollow/sim-core/src/community/community.ts) — the norm and its comment
- [`games/hollow/sim-core/src/governance/governance-system.ts`](../../games/hollow/sim-core/src/governance/governance-system.ts) — how its siblings are consumed
- [`games/hollow/sim-core/src/community/constants.ts`](../../games/hollow/sim-core/src/community/constants.ts) — the join-trust calibration

## Acceptance
- A decision recorded in [`wiki/decisions.md`](../wiki/decisions.md) (or Hollow's own decisions
  section), with the reasoning, not just the outcome.
- If wired: a test showing two communities with different `admissionPolicy` values admit at
  measurably different rates from the **same** seed — the sibling norms' consumers are the model for
  what "consulted" should look like. Plus the before/after population numbers.
- If cut: the field is gone from the snapshot, the protocol and the UI, and the chronicle no longer
  emits `NORM_CHANGED` for it.
- Either way [`wiki/hollow-overview.md`](../wiki/hollow-overview.md) stops advertising three binding
  norms unless there are three.
- Hollow determinism re-verified (same seed → byte-identical). Small runs; ask before a full check.
