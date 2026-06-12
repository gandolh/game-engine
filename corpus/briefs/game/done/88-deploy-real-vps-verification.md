# Brief 88 — execute the deploy on a real VPS (close the dry-run gap)

Promoted from [wiki/open-questions.md](../../../wiki/open-questions.md): the pm2 + Caddy WS-reverse-proxy automation in [deploy/deploy.ts](../../../../deploy/deploy.ts) is **dry-run-verified only** — it has never executed against real hardware.

## Why

The client/server split (briefs 55–58) and the shared-run lobby (brief 72) exist so people can actually watch a run. Until one real deploy succeeds, the deploy script is untested code on the critical path, and the capacity numbers in [wiki/performance.md](../../../wiki/performance.md) ("~10 viewers fits a small 2-vCPU VPS, barely") are unconfirmed extrapolations from the dev box.

## Tasks

1. **Run the deploy for real** on the target VPS (needs the user: host, SSH access, domain). Capture every deviation from the dry run and fix `deploy.ts` / [deploy/Caddyfile](../../../../deploy/Caddyfile) as found.
2. **Verify end-to-end:** browser connects over the Caddy WS proxy, a shared run streams, late-join replay works (brief 72), owner-only controls hold.
3. **Check `permessage-deflate` passes through the proxy** — verification was consciously dropped in 2026-06-10's decision round ("app still works, just heavier frames"); since we're on the box anyway, read the actual frame sizes and record the answer.
4. **Sanity-check capacity:** with 2–3 real viewers, read server CPU/RSS against the probe-perf table in performance.md. Not a load test — just confirm the extrapolation isn't wildly off.
5. **Write the runbook:** a short `deploy/README.md` update (or wiki page) with the verified steps, plus update open-questions.md/status.md to close the gap.

## Guardrails

- **Blocked on user input** (VPS credentials/target) — coordinate before starting; nothing here is runnable autonomously.
- No sim/code changes expected; if the deploy forces one (env, ports, paths), keep it isolated and re-run typecheck + tests.
- Don't leave a half-configured public server running — if verification fails, tear down before stopping.
