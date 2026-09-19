# hollow-17 — The rationalizer is attached to the one decision class its answers cannot survive

status: todo — a build, and it starts at the design end
created: 2026-09-19
context: the residue of [hollow-16](closed/2026-09-15-hollow-16-rationalizer-adoption-latency.md),
which settled the *characterisation* (occasional influence, stated honestly, self-reported) and
deliberately did not attempt the fix. Read that decision in
[decisions.md](../wiki/decisions.md) → *Hollow — the LLM-rationalizer seam* before starting; it
contains the measurement that constrains every option here.

## The measured constraint

The seam is attached at the **social-verb deliberation** boundary. An answer can only be applied at
the agent's next social deliberation, and `SOCIAL_COOLDOWN_TICKS` is 40, so the median answer-lag is
**40–46 ticks**. Over four seeds at 1500 ticks with the `contrarian` provider:

- **43 of 52 consultations rejected**, every one `stale-candidates`.
- In **43 of 43**, the chosen `kind`+`targetId` was absent from the live set. Never once was the
  option merely re-scored or re-sized.
- In **33 of 43**, the same verb was available **against a different peer**.

So the failure is not trust decay and not provider latency. It is that **the subject of the decision
— a specific peer — turns over faster than the answer can arrive.** The lag is pinned by the social
cooldown; the peer set is pinned by perception and movement. Nothing inside the seam can reconcile
them.

## What is already ruled out, and why (do not relitigate)

1. **Loosen identity to `kind` only.** Would adopt in ~33 of 43 cases — each against a person the
   model never reasoned about, while the chronicle carries its rationale about the original target.
   For an instrument built to compare stated against revealed reasoning, this falsifies the record.
   Measured, not assumed. Refused in [decisions.md](../wiki/decisions.md).
2. **Preempt: apply the answer on arrival instead of at the next deliberation.** Would cut the lag to
   ~1 tick with a synchronous provider, but requires redirecting an agent **between** deliberations,
   mid-intention. That breaks [`seam.ts`](../../games/hollow/sim-core/src/rationalize/seam.ts)'s
   stated guarantee — *"the sim's behavior with the seam present is a superset of the sim's behavior
   without it, never a different shape"* — and changes the action model for every agent, seam or not.
   It is also a determinism problem, since a live provider's arrival tick is wall-clock-dependent.
3. **Lower `SOCIAL_COOLDOWN_TICKS`.** hollow-14 tuned interaction volume *down* 6–66× on purpose (the
   chronicle flood). Undoing that to serve the seam is the tail wagging the dog.

## What to do

**Attach the seam where the subject persists.** [`policy.ts`](../../games/hollow/sim-core/src/rationalize/policy.ts)
already documents the candidates and why they were out of scope for hollow-13:

> *"community join/leave is decided by the COMMUNITY-stage crystallize pass from trust topology,
> pair-bonding by the PAIRBOND stage from mutual trust + compatibility, and sanctions by the
> GOVERNANCE stage. None of them is ever an entry in an agent's intention queue, so none is reachable
> from this seam. Extending the seam to those system-driven passes would need its own
> candidate-enumeration work."*

Those subjects — a community, a norm, a leader, a pairing — persist for **hundreds** of ticks. A
40-tick answer-lag is irrelevant against them. That is the whole point.

The work is therefore **candidate enumeration for a system-driven pass**, not a change to the seam's
adoption logic, which the measurement says is correct. Pick **one** pass first and prove the shape end
to end before widening.

Settle before writing code:

1. **Which pass.** Governance (a sanction, a norm) is the most defensible research target — it is
   deliberative by nature and the spec's original list named it. Pair-bonding has ethical framing
   questions a research instrument should answer deliberately, not by accident.
2. **What a candidate IS** for a pass that currently reads topology rather than enumerating options,
   and what its stable identity is. The identity must survive the lag — that is the entire fix, so
   state how it does.
3. **Who the decision belongs to.** The social seam asks one agent. A community decision has no single
   author. If the answer is "the leader", say so and ground it in the governance model.
4. **Determinism.** The pass runs inside a stage; the seam must not make stage output depend on
   arrival order. `seam.ts`'s `Map`-by-key discipline is the precedent.

## Acceptance

- A decision recorded in [decisions.md](../wiki/decisions.md) with the chosen pass and the candidate
  identity, **before** any enumeration is written.
- `RATIONALIZER=contrarian` shows a **materially higher adoption rate** on the new attachment point,
  and the rate is visible in the run summary block hollow-16 added (no new reporting needed).
- The world trajectory **provably diverges** from `RATIONALIZER=off` — compare `metrics.csv`,
  `lineage.json`, `summary.json`; **never** `events.jsonl`, which differs trivially because it carries
  the rationalize rows themselves. (That mistake was made once during hollow-13's closeout and briefly
  looked like success.)
- **A zero-adoption run is not a pass.** Check the summary's explicit note; seed 7 produced a
  byte-identical world for the honest reason that nothing was adopted, and that once read as a finding.
- The anchoring guarantee still holds: every adopted action is one the substrate enumerated, against
  the subject it was reasoned about.
- The social-verb attachment point keeps working unchanged — this adds a second consultation site, it
  does not move the first.
