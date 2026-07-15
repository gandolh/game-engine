---
title: Pin EOL for the committed Farm atlas (atlas-builder test rewrites it with LF)
created: 2026-07-15
status: open
tags: [farm, tooling, windows, small]
---

# Pin EOL for the committed Farm atlas

`@tool/atlas-builder`'s test regenerates `games/farm/client/public/atlas/index.json` with LF line
endings; under Windows autocrlf the on-disk bytes then differ from the checked-out CRLF, so a
test run leaves the file "modified" in `git status` and wobbles turbo's warm-cache stability for
`@farm/sim-core#test` (the atlas is a declared cache input since engine brief 21).

## Acceptance

A `.gitattributes` rule pinning the atlas dir (e.g. `games/farm/client/public/atlas/* -text` or
an explicit `eol=lf`), the tree renormalized once, and a test run leaving `git status` clean.
