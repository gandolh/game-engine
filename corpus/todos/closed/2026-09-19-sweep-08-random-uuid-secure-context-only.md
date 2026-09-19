# sweep-08 — `crypto.randomUUID()` on Farm's boot path is secure-context-only; over plain HTTP the client dies before its first frame

status: todo
created: 2026-09-19
context: found by a read-only structure/performance/compatibility sweep on 2026-09-19. The smallest
brief in the set and the one with the sharpest failure mode. Two other sites in the same two files
already handle this class of API correctly — so this is one missed site, not a missing habit.

## The gap

[`games/farm/client/src/main.ts`](../../../games/farm/client/src/main.ts) (~340), inside the call that
starts the run:

```ts
client.init({
  seed,
  tickRateHz: CONFIG.tickRateHz,
  ticksPerDay,
  maxDays,
  // Unique per tab so each visitor gets a private server run and always
  // owns their own Pip. UI-side only — never reaches sim logic, so
  // determinism is unaffected.
  clientId: crypto.randomUUID(),
});
```

`crypto.randomUUID` is **secure-context-only**. In a non-secure context it is `undefined`, so this is a
`TypeError: crypto.randomUUID is not a function` thrown **synchronously during boot**, before
`createRenderLoop`, before the first frame. The user sees the loading state forever.

A non-secure context is not exotic. It is:

- `http://192.168.1.x:5173` — the Vite dev server opened from a phone or a second machine on the LAN,
  which is the normal way anyone looks at this game on a touch device;
- `http://<hostname>:5173` on a home network;
- any plain-HTTP reverse-proxy front end. [`infrastructure/README.md`](../../../infrastructure/README.md)
  is the contract for the container, and [decisions.md](../../wiki/decisions.md) → Concurrency records that
  *"the deployment configuration … is maintained outside this repository"* — so **this repo cannot
  assert that the proxy in front of it terminates TLS.** `localhost` is secure; an IP is not.

## Why this is one missed site rather than a pattern

The repo already knows the shape. Forty-four lines above, in the *same file*:

```ts
const clip = navigator.clipboard;
if (clip && typeof clip.writeText === "function") {
  clip.writeText(url).then(…);
} else {
  shareStatus = "URL in address bar";
}
```

Properly guarded, with a graceful degradation and a user-visible message.
[`games/hollow/client/src/main.ts`](../../../games/hollow/client/src/main.ts) (~389) does the equivalent
with `try { await navigator.clipboard.writeText(…) } catch { /* address bar is already shareable */ }` —
a different answer, also correct. `navigator.clipboard` is secure-context-only for exactly the same
reason as `randomUUID`. Two sites handled, one not.

The difference that makes it matter: **the clipboard sites are optional side features on a user
gesture; this one is on the critical boot path.** A missing clipboard costs a convenience. A missing
`randomUUID` costs the whole game.

## Severity, stated honestly

**No one has reported this**, and over HTTPS or on `localhost` — which is every path anyone has
exercised — it works perfectly. So this is a latent compatibility bug, not a live outage. It is filed
because the cost of fixing it is three lines and the cost of hitting it is "the game does not start,
with a console error that looks like a bundler problem."

It is also worth noting what the fix is **not** about: the comment at the call site is correct that
`clientId` is UI-side only and never reaches sim logic, so **determinism is not in play here.** Any
replacement must keep that true — which means the substitute must not be seeded `Rng` (wrong layer) and
must not be anything the sim can observe.

## What to do

1. **Replace the call with a helper that degrades.** `crypto.getRandomValues` **is** available in
   insecure contexts (only `crypto.subtle` and `crypto.randomUUID` are gated), so the substitution is
   local and keeps the same uniqueness properties:

   ```
   randomUUID() when available
     → else assemble a v4 from crypto.getRandomValues(new Uint8Array(16))
       → else (no crypto at all) a timestamp + Math.random() id, which is fine
          because this value is host-side identity, never sim input
   ```

   The third rung is deliberate: `Math.random()` is banned in **sim** code
   ([decisions.md](../../wiki/decisions.md) → Sim), and this is client boot code that the sim never reads.
   Say so in a comment at the site, or the next sweep will flag it as a determinism violation — the
   2026-09-19 sweep already spent effort confirming that every `Math.random` hit in the repo was a
   comment asserting the rule.

2. **Put the helper where the other three games can reach it.** Farm is the only game that needs a
   client id today (it is the only one with a server), so `@farm/client` is an acceptable home. But this
   is a generic host-side concern, and `@engine/core/runtime` already owns `Rng` and `createTickPump`.
   If it goes in the engine, it must be named so nobody mistakes it for sim randomness —
   `hostRandomId()`, not `randomId()`.

3. **While in there, sweep the rest of the secure-context surface.** I checked and found nothing else
   live: no `crypto.subtle`, no `navigator.storage`, no `navigator.locks`, no file-system-access pickers,
   no `SharedArrayBuffer` use (the one hit is a comment about `ImageData` typing). Confirm that still
   holds at implementation time and record it — a short "already checked, still clean" line is worth more
   than re-deriving it next quarter.

4. **Consider whether it should fail loudly instead.** There is a real alternative: keep requiring a
   secure context and show a legible message ("this game needs https or localhost") rather than
   substituting. Rejected as the default because the substitution is three lines and loses nothing — the
   id only has to be unique per tab. But if implementation reveals the id needs cryptographic
   unforgeability (it does not, per the call-site comment: the server's real protection is
   `maxRuns`, see [audit-42](2026-09-18-audit-42-farm-server-public-surface.md)), revisit.

## Files you OWN
- `games/farm/client/src/main.ts` (the one call site)
- the new helper's module + its test
- `engine/core/src/runtime/` only if you choose the engine home in step 2

## Files you must NOT touch
- `games/farm/server/src/run-registry.ts` — the server's handling of `clientId` is unchanged. Its
  `maxRuns` ceiling and reap logic are audit-42's work and are not in scope.
- The clipboard sites in Farm and Hollow. They are already correct, in two different ways. Converging
  them is cosmetic and belongs with
  [sweep-03](2026-09-19-sweep-03-converge-pointer-gesture-handling.md)'s "four games, four answers"
  theme if anyone wants it.
- Anything in a `sim-core`. This is boot-path host code and must stay there.

## Acceptance
- **Demonstrated red first.** Stub `crypto.randomUUID` to `undefined` in a test (or a dev override) and
  show the current boot path throws; then show the fixed path produces a usable id. A green test over
  the new helper alone does not prove the call site was the problem.
- **The real check: load Farm over a non-secure origin** — the dev server bound to `0.0.0.0` and opened
  by LAN IP — and confirm it connects and renders. This is the scenario; the unit test is the guard.
- The produced id is still unique per tab (two tabs, two distinct ids, two distinct server runs).
- A comment at the fallback explaining why `Math.random()` is legitimate there, so the next determinism
  sweep does not re-flag it.
- `npm run typecheck` + `npm run test -w @farm/client`.
