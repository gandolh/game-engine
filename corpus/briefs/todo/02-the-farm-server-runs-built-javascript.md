# Task 02 — The Farm Valley server runs built JavaScript, started by node

## Context

The VPS has 3.7 GiB of RAM shared by every app in the estate, and the owner
doesn't want to upgrade it (vps-deploy's `memory-on-the-box` research,
2026-11-04). The Farm Valley sim's container (`farm-valley-sim` on the box)
runs from source under tsx, started through `npm`: `CMD ["npm", "run",
"server"]`, which runs `npm start -w @farm/server`, then tsx. On 2026-11-04
the tsx process held 12 MB with 41 MB in swap and the two `npm` wrappers
about 15 MB plus swap; the container used 27 MB.

The owner decided on 2026-11-04 that the apps on the box run built
JavaScript and start with `node` directly. This revisits the Dockerfile's
"runs from SOURCE under tsx" choice for the server; record that where the
choice is written down.

## Files you OWN

- The `@farm/server` workspace's build setup (a `build` script, emit
  config), and the workspaces it imports only as far as the build needs
- `infrastructure/Dockerfile` (a build stage; the runtime stage runs `node`
  on the output) and the compose file if paths change
- `README.md`, docs pages that name the start command
- `corpus/wiki/` pages that say the server runs under tsx, `status.md`,
  `log.md`

## What to do

1. Build the server to JavaScript (`tsc`, or a bundler if workspace imports
   of raw `.ts` or the WASM pathfinder make `tsc` awkward; say which and
   why). Keep the dev scripts on tsx.
2. The runtime image runs `CMD ["node", "<built entry>"]`: no `npm`, no
   `tsx`.
3. Check the sim still runs deterministically from the built output (the
   existing determinism check, not the heavy suites).
4. Measure the container idle before and after (`docker stats`; Docker is up
   locally).

## Acceptance

- The image builds, the container starts and serves a client; the server
  workspace's light tests pass.
- `npm` and `tsx` aren't in the runtime process tree (`docker top`).
- The outcome gives idle memory before and after. The deploy is the owner's
  step from vps-deploy.
