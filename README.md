# Hollow, built for ImbatranimOS

This branch holds only Hollow's built ImbatranimOS module, for installing
Hollow from a URL (ImbatranimOS brief 158). The source is on `main`.

Install it in ImbatranimOS from **Settings → Marketplace → Install from a URL**
with `https://github.com/gandolh/game-engine/tree/imbatranim-app`.

To rebuild from `main`:

1. `npm run build:os -w @hollow/client` (output in `games/hollow/client/dist/os/`).
2. Replace `dist/hollow.mjs` and `dist/assets/` here with that output, leaving
   out the `.map` files.
3. Commit on this branch, naming the `main` commit it was built from.
