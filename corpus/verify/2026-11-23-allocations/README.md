# Per-frame allocations (brief 20, in progress)

Brief 20 was paused by the owner on 2026-11-23 after its first step (commit `90ee9b84`). The hand-off,
with what is left, is the last comment on the brief's ticket and in the brief's next outcome.

- `heap.mjs <url> <out.json>` takes a sampling heap profile over a bench scene in headless Chromium over the
  DevTools protocol: sampling starts 3 s into the warm-up, and the total is divided by `displayTicks`.
  It needs the game's dev server up; Farm also needs `npm run server`.
- `farm-before-heap.json` and `farm-after2-heap.json`: Farm, 2.75 MB a frame before, 1.54 MB after.
- `mq-before-heap.json` and `mq-after1-heap.json`: MateQuest, 854 KB a frame before, 203 KB after. The
  after run saw fewer combat screens (210 against 300 display ticks), so compare with care.

Before numbers vary by about 10% between runs. The ranked sites, the bench counters and the closing
numbers come when the brief resumes.
