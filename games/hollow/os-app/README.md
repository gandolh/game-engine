# Hollow, built for ImbatranimOS

This folder is Hollow as an app installed from a URL into ImbatranimOS
(ImbatranimOS brief 158): `imbatranim.json` beside the built module. It is
build output, committed on purpose, because ImbatranimOS builds nothing it
installs from a URL. The source is `games/hollow/client` (the module entry is
`src/os-entry.ts`).

Install it from **Settings → Marketplace → Install from a URL** with:

```
https://github.com/gandolh/game-engine/tree/main/games/hollow/os-app
```

It runs in ImbatranimOS's sandboxed frame. It asks for no capabilities, and
its sim worker loads relative to the module.

## Refreshing it

After a change to Hollow's client or sim:

```bash
npm run build:os-app -w @hollow/client
```

That runs `vite build --mode os` and copies `dist/os/` here without the
source maps (`scripts/sync-os-app.mjs`). Commit the result with the change
that caused it, so the commit an install pins carries a matching build.
`.gitignore` excludes every `dist` folder except this one.
