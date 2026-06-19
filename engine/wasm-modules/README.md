# @engine/wasm-modules

AssemblyScript sources compiled to `.wasm` and consumed by `@engine/core/wasm`.

## Layout

- `src/<name>.ts` — one AssemblyScript module per file (each becomes a `.wasm`).
- `asconfig.json` — `asc` compiler options shared by every module.
- `build/compile.mjs` — invokes `asc` for every `src/*.ts`, emits to `dist/`,
  then copies each `.wasm` into `games/farm/client/public/wasm/`.

## Building

```
npm run build -w @engine/wasm-modules
```

Or from the repo root:

```
npm run build-wasm
```

The output is committed in `games/farm/client/public/wasm/` so a fresh
clone can `npm run dev` without first building wasm. Re-run the build after
editing any `src/*.ts`.

## Adding a module

1. Drop a new file at `src/<name>.ts`.
2. Export raw exports (numbers/usize). Use `heap.alloc(size)` for scratch.
3. Run the build. A new `/wasm/<name>.wasm` will appear in the farm client's
   public assets and the engine loader can fetch it.

## Why AssemblyScript

It is TypeScript-shaped, matches the rest of the repo's coding style, and has
no external native toolchain (compiler ships as an npm package, runs in Node).
Trade-off: it is a different language (no closures, manual memory in `stub`
mode, AS-specific built-ins like `load<T>` / `store<T>`).
