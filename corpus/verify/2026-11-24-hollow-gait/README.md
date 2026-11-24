# Hollow gait by ground covered: captures (brief 27)

`gait-<speed>-N.png` are four 600x450 crops of Hollow, seed 42, camera zoomed in, 300 ms apart, headless Chromium
with SwiftShader. `shot.mjs` takes them (`node shot.mjs <url> <prefix>`): it starts the town, zooms the orbit
camera, then presses 1x, 8x and Pause in turn.

- Paused: the four frames are byte-identical (same md5), so a walker holds mid-stride and nothing marches in place.
- 1x and 8x: every frame differs, as walkers move and the pose follows position. At 8x the cadence is capped at 4 Hz.

Frame-level leg comparison by eye is limited, since the sim keeps ticking (and the town moves on) between frames.
