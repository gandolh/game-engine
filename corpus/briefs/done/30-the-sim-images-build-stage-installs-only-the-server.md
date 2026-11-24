# Task 30: The sim image's build stage installs only the server, on a pinned base

**Origin:** the estate's infra review of 2026-11-24. Every app image is built on the box by vps-deploy's `server`
phase, and on 2026-11-23 the box's build cache (9.3 GB) took its disk to 90%. The cache was pruned to zero on
2026-11-24, so the next rollout builds every image cold. The same tidy is filed in ten repos; sports-app's
Dockerfile already scopes its build install.

**Builder:** Sonnet ([routing.md](../../routing.md)).

**Depends on:** nothing.

## Context

Three things in `infrastructure/Dockerfile`, all build-side or base-side. The image that runs doesn't change.

- **The `deps` stage installs every workspace** (`RUN npm ci`, line 45) to build one: the `build` stage runs
  `npm run build -w @farm/server` (line 51), a Vite bundle of the server and the engine packages it imports. The
  clients, the tools, the docs site and their trees are installed for nothing. Measured on the laptop on
  2026-11-24: the full install is 720 MB of `node_modules`; `@farm/server`'s closure plus the root's dev
  dependencies (which hold `vite` and `typescript`) is about 263 MB, so about 457 MB less per cold build.
- **The base floats.** `FROM node:24-alpine` (lines 35 and 53) follows whatever the tag is on the day of the
  build: on the laptop it is Node 24.21.0 on alpine 3.24.2, while imbatranimOS pins `node:24.22.1-alpine`. On the
  box that is two separate 171 MB bases and two copies of the `apk add python3 make g++` layer, which is otherwise
  one cached layer shared by every alpine Dockerfile. vps-deploy's weekly housekeeping removes a base tag no image
  uses after two weeks; the next deploy pulls the tag's current image and every cache entry keyed on the old one
  is dead.
- **Line 1 is `# syntax=docker/dockerfile:1-labs`**, a frontend image resolved from Docker Hub on every build. It
  is there only for `COPY --parents` (lines 41-43). A floating tag can change under a build or fail it when Hub
  is unreachable.

The root `package.json` declares a `portal` workspace whose manifest the Dockerfile never copies, and the
farm-valley stack doesn't send it; the image built and deployed that way on 2026-11-24. Leave that as it is.

## Files you OWN

- `infrastructure/Dockerfile`
- `corpus/` pages for this brief: the outcome, `log.md`, and the Dockerfile line in
  [status.md](../../wiki/status.md) if it names the install

## Files you must NOT touch

- Any `package.json` or `package-lock.json`.
- `.dockerignore` and the wasm check in the `prod` stage.
- vps-deploy: read only.

## What to do

1. **Check the scoped install without Docker.** Export the tree to a scratch folder outside the repo
   (`git archive HEAD | tar -x -C <scratch>`). There, run the full `npm ci` and `du -sm node_modules`; delete
   `node_modules`, run `npm ci -w @farm/server --include-workspace-root`, `du -sm` again, then
   `npm run build -w @farm/server`. The bundle must build. If it fails on a missing package, find which workspace
   brings it, add it to the command, and say so in the outcome.
2. **Find the syntax pin.** Read the Dockerfile frontend's release notes for the first stable version that has
   `COPY --parents` without labs. Pin `# syntax=docker/dockerfile:<that exact version>`; if none has it, pin the
   labs channel to an exact version (`1.<n>-labs`). Don't drop the line: that would tie the build to the box
   daemon's built-in frontend, whose version nobody here can read.
3. Edit the Dockerfile: the scoped `deps` install with a comment saying why (every manifest is still copied,
   because `npm ci` checks the lockfile against all of them), both `FROM` lines on `node:24.22.1-alpine`, and the
   pinned syntax line.
4. On the laptop, build today's image and the new one (`docker compose -f infrastructure/docker-compose.yml build
   farm-valley-sim`) and save `docker history` of each and the `deps` stage's size
   (`docker build --target deps`).
5. Start the new image: it stays up, logs that it listens on 8787, and a WebSocket handshake to it succeeds.

If your session can't build Docker images, do steps 1 to 3, run the checks, and hand back with steps 4 and 5 for
the controller.

## Acceptance

- Step 1's two `du` readings and the build result are in the outcome.
- The image builds on the laptop; `docker history` before and after, from one machine, in the outcome. The
  `deps` stage is smaller; the final image is within a few MB of today's.
- Step 5 passes.
- `npm run check` exits 0, and `bash corpus/lint.sh` passes.

## Owner steps

- `node cli.ts farm-valley server` from the vps-deploy checkout. The deploy builds the image on the box.

## Owner decisions

- None.

## Outcome

Built 2026-11-24 by the controller (0758542c). Ready for deploy: `node cli.ts farm-valley server`.

- **Step 1**, in a `git archive` export: the full `npm ci` leaves 720 MB of `node_modules`; `npm ci -w
  @farm/server --include-workspace-root` leaves 265 MB (455 MB less), and `npm run build -w @farm/server` bundles
  (`dist/index.mjs`, 606 kB). No other workspace was needed.
- **Step 2**: `docker/dockerfile:1.20.0` is the first stable frontend with `COPY --parents`. Checked by building a
  three-line test Dockerfile with `COPY --parents */*/package.json ./`: on `1.19.0` it fails with "dockerfile parse
  error on line 4: unknown flag: --parents"; on `1.20.0` and on `1` it copies both files. The BuildKit Dockerfile
  reference lists `--parents` in the stable syntax with 1.20 as its minimum. The syntax line now pins `1.20.0`,
  with a comment.
- **Step 3**: the scoped `deps` install with a comment saying why; both `FROM` lines are `node:24.22.1-alpine`.
  `wiki/status.md`'s Node line names the pinned base.
- **Step 4**, both built on the laptop the same hour: the `deps` stage image 1.41 GB before, 836 MB after; the
  final image 171 MB before, 173 MB after. In `docker history` the base layers differ by about 10 kB to 1 MB (the
  pinned Node patch), and the `engine/wasm-modules/dist` COPY is 4.41 kB before and 36 kB after: the "before"
  image was built from `git archive HEAD` and the "after" from the working tree, which also holds the gitignored
  `.wat` files beside the tracked `.wasm`. Not from this change.
- **Step 5**: the new image stays up, logs "Farm Valley sim server listening on ws://localhost:8787", and a
  WebSocket handshake to it opens; Node is v24.22.1. Test images and the container were removed.
- `npm run check` exits 0 (turbo replayed every task from its cache: no code input changed);
  `bash corpus/lint.sh` passes.
