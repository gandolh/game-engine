# Hollow as an ImbatranimOS marketplace app: a build that exports `mount` / `unmount`

status: todo — a build target and a refactor of the client's entry; no sim change
created: 2026-10-06
context: ImbatranimOS can now install apps from other repositories (its brief 120, done
2026-10-06). It clones a repo at a pinned commit, runs the repo's own build, and imports one ES
module into a desktop window. Hollow is meant to be the first game installed that way, and no game
here exports what the desktop imports. This spec is the game side. The desktop side is built and
was walked end to end with test apps.

## The contract the desktop calls

Documented in the imbatranimOS repo at `marketplace/README.md`. In short, the build must produce one
ES module, inside an output directory, exporting:

```ts
export function mount(
  container: HTMLElement,
  system: SystemHandle,
  host: { appId: string; assetBase: string; server: { http: string; ws: string } | null },
): void | Promise<void>

export function unmount(container: HTMLElement): void
```

- `container` is the window's content element. The game renders into it and nowhere else. The
  window can be resized, minimised, and closed and reopened in the same page.
- `unmount` must stop everything `mount` started: the animation frame loop, the sim Web Worker,
  listeners on `window`/`document`, ResizeObservers, the WebGL2 context.
- The module is served from the build's output directory under the desktop's own origin. Chunks,
  the worker script and assets must load relative to the module (`import.meta.url` or
  `host.assetBase`), never from `/`.
- It must be self-contained: the desktop's React and `@imbatranim/ui` are not importable. Hollow
  uses neither, so this costs nothing.
- `system` is optional to use. Hollow needs none of it to start; `system.window.setTitle` and
  `system.notify` are the obvious first uses. Any it uses must be listed in the descriptor.

## What has to change in `games/hollow/client`

`src/main.ts` is a page script today, not a module with an entry point. At import time it:

- reads `#app` and `#scene` from `index.html` and throws if they are missing;
- paints `document.body` (background and text colour);
- starts the sim worker with `new Worker(new URL("./worker/sim-worker", import.meta.url))`
  (this part already resolves relative to the module, which is what the desktop needs);
- reads a run descriptor from `location.hash` (inside the desktop that is the desktop's hash, not
  Hollow's);
- runs `requestAnimationFrame` loops that nothing stops.

The work:

1. **Move the body of `main.ts` into `mount(container)`.** Create the `#app` structure and the
   `#scene` canvas inside `container` instead of finding them in the page. Keep a `main.ts` for the
   standalone page that calls `mount(document.getElementById(...))`, so `npm run dev` and the
   existing standalone build behave as now.
2. **Scope page-level styling to the container.** No writes to `document.body`; any global CSS from
   `style.css` gets a container-level root class, and the CSS is either injected by `mount` or
   inlined into the module (the desktop loads only the `.mjs`).
3. **`unmount(container)`**: cancel the frame loops, `worker.terminate()`, remove listeners and
   observers, release the WebGL2 context (`WEBGL_lose_context`) and the canvas, empty the
   container. A window closed and reopened must not leak a GL context each time.
4. **The run-descriptor hash**: inside the desktop, ignore `location.hash` (take no descriptor, or
   accept one later through `system.intents`). The standalone page keeps reading it.
5. **A second build target**, for example `build:os` with Vite library mode, producing
   `dist-os/hollow.mjs` with the worker and chunks beside it, ES2022 as now.
6. **Test**: a jsdom test that mounts into a detached element, then unmounts and checks that the
   worker was terminated and no frame callback is still scheduled.

## The install path, which affects how the build is written

The desktop runs the descriptor's `build.install` and `build.command` as argv (no shell), in the
directory the descriptor names, with a 15-minute limit each and no C compiler in the image. For
this monorepo:

- Hollow imports `@engine/core` and `@hollow/sim-core` as workspace packages, so the install has to
  run at the repo root (`npm ci`, about 485 MB of `node_modules` across every workspace). The likely
  descriptor uses `subdir` = the root, `build.install` = `["npm", "ci"]`,
  `build.command` = `["npm", "run", "build:os", "-w", "@hollow/client"]` and
  `build.entry` = `games/hollow/client/dist-os/hollow.mjs`. Check that this order works from a
  fresh clone before writing the descriptor.
- The only install script in the lockfile is esbuild's, which ships prebuilt binaries, so nothing
  needs a compiler. The committed wasm artifacts mean no AssemblyScript build either. Keep it that
  way.
- The served directory may hold at most 256 MB.

## Done when

- `npm run build:os -w @hollow/client` produces `dist-os/hollow.mjs` from a fresh clone, and the
  standalone `npm run dev` / `npm run build` behave as before.
- The mount/unmount test passes, and `npm run typecheck` and the client's tests are green.
- The commit is pushed, so it can be pinned. Then, in the imbatranimOS repo,
  `marketplace/hollow.json` pins that full commit id, and in its dev container Settings →
  Marketplace installs Hollow, opens it in a window with the 3D view running, and survives closing
  and reopening the window. That last check is the imbatranimOS brief 120 gate.

Farm Valley and Citadel come after Hollow. They also need their Node sim server run as a
marketplace "service" (the desktop starts it, gives it a port in `PORT`, and proxies its WebSocket
to `host.server.ws`); that is a separate spec once Hollow works.
