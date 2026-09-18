# audit-63 — Two of Hollow's six milestones are invisible in the app that exists to observe them

status: todo
created: 2026-09-18
context: found by the undone-work lens of the 2026-09-18 sweep. Named as a follow-up in Hollow's own
BUILD-STATE and never queued.

## The gap

[`2026-07-17-hollow-BUILD-STATE.md`](2026-07-17-hollow-BUILD-STATE.md) records it:

> *"**Governance/feuds are NOT surfaced in the 3D client / research UI yet** — 12a+12b are sim-core +
> observe (chronicle events + a metric) only. A follow-up client brief could render leader/standing,
> norm state, sanctions, and active feuds."*

Still true, and it has a measurable cost on both sides:

- **The snapshot pays for data nobody reads.** [`snapshot-builder.ts:131-132`](../../games/hollow/sim-core/src/snapshot-builder.ts#L131-L132) emits `leaderId: c.leaderId, standing: { ...c.standing }` every tick. `grep -rnw 'leaderId\|standing'` over `games/hollow/client` returns **no readers** (the one hit is prose in a comment about agents standing on adjacent tiles). `standing` is a full `Record<number, number>` structured-cloned to the main thread every tick for nothing.
- **The client inspect payload carries only two of the norms.** [`worker/inspect.ts:118-124`](../../games/hollow/client/src/worker/inspect.ts#L118-L124) passes `shareRate` + `cooperationExpectation` and nothing else.
- **The dashboard has six charts and none of them are governance, feuds or disease.** [`dashboard-panel.ts:47-85`](../../games/hollow/client/src/dashboard-panel.ts#L47-L85) plots population, births/deaths, communities, trust/gini, coop-vs-antag and genes — while the sampler already produces `feud_active_dyads` ([`observe/sampler.ts:90`](../../games/hollow/sim-core/src/observe/sampler.ts#L90)) and `deaths_disease_window` ([`:84`](../../games/hollow/sim-core/src/observe/sampler.ts#L84)).

So hollow-12 (governance) and hollow-15 (mortality/care) are readable only by exporting CSV and opening
it elsewhere — in a project whose stated purpose is *"a research instrument"*.

## What to do

Surface them, and let that decide the snapshot shape rather than the other way round:

- **Leader + standing** in the inspect panel and/or on the agent itself in the 3D scene. Then either
  the snapshot fields have a reader, or — if standing turns out not to be worth showing per-tick —
  stop shipping a whole `Record` across the worker boundary every tick. Both outcomes are wins; decide
  on evidence.
- **Norm state and sanctions** in inspect, alongside the two norms already there. Note
  [audit-49](closed/2026-09-18-audit-49-admission-policy-inert-norm.md): do not surface `admissionPolicy` as
  binding until it is.
- **Two more dashboard series** — `feud_active_dyads` and `deaths_disease_window` — which is nearly
  free, since the sampler already emits them and the chart machinery exists.

Start with the dashboard series: cheapest, and it immediately makes two milestones observable.

## Files you OWN
- [`games/hollow/client/src/dashboard-panel.ts`](../../games/hollow/client/src/dashboard-panel.ts)
- [`games/hollow/client/src/worker/inspect.ts`](../../games/hollow/client/src/worker/inspect.ts)
- [`games/hollow/sim-core/src/snapshot-builder.ts`](../../games/hollow/sim-core/src/snapshot-builder.ts) — only if the standing decision says so
- [`wiki/hollow-overview.md`](../wiki/hollow-overview.md)

## Files you must NOT touch
- the governance and feud **systems** — they work; this is an observation brief, and changing
  behaviour while adding a view of it makes both unverifiable
- [`observe/sampler.ts`](../../games/hollow/sim-core/src/observe/sampler.ts)'s existing metrics — the
  data is already there; this brief consumes it
- the chronicle/CSV export path — it already works and is the current workaround

## Acceptance
- The two metrics appear as dashboard series and match the CSV export for the same seed.
- Leader and standing are visible in the client, **or** the unread snapshot fields are removed with the
  reasoning recorded. Not both, and not neither.
- No sim behaviour change: same seed → **byte-identical** run.
- `wiki/hollow-overview.md` stops describing governance and mortality as un-surfaced.
