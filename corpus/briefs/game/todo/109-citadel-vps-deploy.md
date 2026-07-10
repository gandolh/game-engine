# Brief 109 — Citadel VPS deploy

status: todo
source: gap found in the 2026-07-02 opportunity scan — Farm's real-VPS deploy shipped and
was user-confirmed (brief 88, pm2 + Caddy incl. the WS proxy), but nothing deploys Citadel;
there is no `deploy/` scaffold in the repo (the brief-88 artifacts live wherever that pass
put them — locate them first).

## Scope

1. **Locate the existing Farm deploy artifacts** (brief 88 / the briefs 55–58 deploy phase)
   and reuse their pattern — same VPS, same Caddy, additive only; do not disturb the Farm
   deploy or other projects on the shared box.
2. **Citadel static client**: production Vite build served under a Caddy sub-path.
   Note the client runs solo sims in a Web Worker — solo play needs NO server process.
3. **Citadel MP server** (`games/citadel/server`, :8788): pm2 long-lived service + Caddy
   WS reverse-proxy, mirroring the Farm sim-server setup. Confirm `?mp` connects through
   the proxy (the WS path/port wiring is the part that differs from local dev).
4. The `bootstrap-vps-deploy` skill's single `deploy.ts` (pre-deploy | deploy | server |
   all) is the preferred scaffold if the brief-88 artifacts aren't reusable as-is.

## Constraints

- Additive on a shared VPS: no global Caddy rewrites, no pm2 process-name collisions.
- Real-hardware verification is the acceptance bar (brief 88 precedent) — a dry run is not
  closeout. Do not deploy without the user in the loop for the actual VPS run.
- ⚠️ **Gated on [brief 110](110-citadel-client-world-size.md)** (decision #11): the MP client
  currently renders only a 96×96 corner of the server's 256×256 world, so deploying the MP server
  before 110 lands would ship that bug to a real box. Solo needs no server and is unaffected.

## Acceptance

- Citadel reachable at its sub-path on the VPS; solo runs entirely client-side; `?mp`
  works through the Caddy WS proxy from two remote browsers; Farm deploy untouched;
  deploy steps documented next to the Farm ones.
