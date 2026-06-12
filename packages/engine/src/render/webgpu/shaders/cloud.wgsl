// cloud.wgsl — fBm cloud-shadow pass (brief 15)
//
// Draws a full-screen cloud-shadow overlay using 3-octave fBm value noise.
// The fBm is sampled in world-space coordinates (world-anchored, not screen-anchored)
// so clouds stay put over the terrain as the camera pans or zooms.
//
// Bind group layout:
//   group(0) binding(0) : ViewUniform  — world→clip transform (set once per pass by orchestrator)
//   group(1) binding(0) : CloudUniform — shadow color (pre-parsed EDG RGB floats), coverage,
//                                        drift speed, and wall-clock time
//
// No vertex buffer — a fullscreen triangle covers the entire clip-space viewport.
// The vertex shader inverts the view transform to recover world coordinates from clip-space,
// which ensures the fBm samples are world-anchored regardless of camera pan/zoom.
//
// World-anchor derivation:
//   clip_x = world_x * scaleX + offsetX  →  world_x = (clip_x - offsetX) / scaleX
//   clip_y = world_y * scaleY + offsetY  →  world_y = (clip_y - offsetY) / scaleY
//
// Alpha quantization: 3 discrete steps (0, MID, HIGH) — pixel-art friendly.
// Max composite alpha is low (0.10–0.18) so the tint pass above still reads clearly.

// ── Uniforms ──────────────────────────────────────────────────────────────────

struct ViewUniform {
    scale_x  : f32,
    scale_y  : f32,
    offset_x : f32,
    offset_y : f32,
}

@group(0) @binding(0) var<uniform> view_u : ViewUniform;

// CloudUniform layout (16 bytes, WGSL struct align rules):
//   offset  0: shadow_color (vec3<f32>, align 16, size 12) — EDG RGB (0..1), CPU-parsed
//   offset 12: coverage     (f32, align 4)  — [0..1], 0 = clear, 1 = full overcast
//   offset 16: drift_speed  (f32, align 4)  — cloud scroll rate (world px / s)
//   offset 20: time_sec     (f32, align 4)  — wall-clock seconds (animation phase)
//   offset 24: _pad0        (f32, align 4)  — struct must be 32-byte multiple
//   offset 28: _pad1        (f32, align 4)
// Total: 32 bytes.
struct CloudUniform {
    shadow_color : vec3<f32>,
    coverage     : f32,
    drift_speed  : f32,
    time_sec     : f32,
    _pad0        : f32,
    _pad1        : f32,
}

@group(1) @binding(0) var<uniform> cloud_u : CloudUniform;

// ── Vertex output ─────────────────────────────────────────────────────────────

struct VertexOut {
    @builtin(position) clip_pos  : vec4<f32>,
    @location(0)       world_pos : vec2<f32>,
}

// ── Vertex shader — fullscreen triangle (no vertex buffer) ───────────────────
//
// Generates 3 vertices covering [-1,1]^2 clip-space (the fullscreen triangle trick).
// Recovers world-space position from each clip-space position by inverting the view
// transform, so the fBm noise is sampled in world coordinates (world-anchored).

@vertex
fn vs_main(@builtin(vertex_index) vi : u32) -> VertexOut {
    let cx = select(-1.0, 3.0, vi == 1u);
    let cy = select(-1.0, 3.0, vi == 2u);

    // Invert view transform: world = (clip - offset) / scale
    let wx = (cx - view_u.offset_x) / view_u.scale_x;
    let wy = (cy - view_u.offset_y) / view_u.scale_y;

    var out_v : VertexOut;
    out_v.clip_pos  = vec4<f32>(cx, cy, 0.0, 1.0);
    out_v.world_pos = vec2<f32>(wx, wy);
    return out_v;
}

// ── Value-noise helpers ───────────────────────────────────────────────────────
//
// Standard 2D bilinear value noise (same recipe as water.wgsl — Book of Shaders ch. 11).
// hash21 maps a 2D coordinate to a pseudo-random float in [0,1).
// valueNoise returns a smooth 0..1 noise value at the given coordinate.

fn hash21(p_in : vec2<f32>) -> f32 {
    return fract(sin(dot(p_in, vec2<f32>(127.1, 311.7))) * 43758.5453);
}

fn valueNoise(p_in : vec2<f32>) -> f32 {
    let i_floor = floor(p_in);
    let fr = fract(p_in);
    // Cubic Hermite smoothing (smoother than linear; avoids crease seams).
    let sm = fr * fr * (3.0 - 2.0 * fr);
    let a_val = hash21(i_floor + vec2<f32>(0.0, 0.0));
    let b_val = hash21(i_floor + vec2<f32>(1.0, 0.0));
    let c_val = hash21(i_floor + vec2<f32>(0.0, 1.0));
    let d_val = hash21(i_floor + vec2<f32>(1.0, 1.0));
    return mix(mix(a_val, b_val, sm.x), mix(c_val, d_val, sm.x), sm.y);
}

// ── 3-octave fBm ─────────────────────────────────────────────────────────────
//
// 3 octaves of value noise at increasing frequencies (×2 per octave) and decreasing
// amplitudes (÷2 per octave). The result is in roughly [0,1) after normalization.
// Driven by `p_frac` (fractional world coordinate) and `drift` (animated offset).

fn fbm3(p_coord : vec2<f32>) -> f32 {
    var val  : f32 = 0.0;
    var amp  : f32 = 0.5;
    var freq : f32 = 1.0;
    // 3 octaves — good soft blobs without sub-pixel noise.
    val += amp * valueNoise(p_coord * freq);
    amp  *= 0.5;
    freq *= 2.0;
    val += amp * valueNoise(p_coord * freq);
    amp  *= 0.5;
    freq *= 2.0;
    val += amp * valueNoise(p_coord * freq);
    // Normalize to [0,1]: sum of geometric series (0.5+0.25+0.125=0.875; max≈1×0.875).
    return val / 0.875;
}

// ── Fragment shader ───────────────────────────────────────────────────────────
//
// 1. Sample 3-octave fBm in world-space (world-anchored, large blobs ~128 world px).
// 2. Apply a slow time-driven drift horizontally (dx = drift_speed * time_sec).
// 3. Threshold the fBm with coverage to get a soft blob mask.
// 4. Quantize to 3 alpha levels (0, LOW, HIGH) — pixel-art friendly.
// 5. Multiply the EDG shadow_color by the quantized alpha (no RGB synthesis).
// 6. Return premultiplied output for source-over blending.
//
// Quantized levels:
//   fBm > (1 - coverage * 0.55):  alpha = HIGH (0.14 * coverage)
//   fBm > (1 - coverage * 0.80):  alpha = MID  (0.08 * coverage)
//   else:                          alpha = 0
//
// These thresholds are coverage-scaled so sparse (sunny) days produce only a few
// small patches and overcast days fill most of the sky.
//
// Output is premultiplied source-over: rgb = color * alpha, a = alpha.

@fragment
fn fs_main(in_f : VertexOut) -> @location(0) vec4<f32> {
    let wp = in_f.world_pos;

    // Cloud scale: 1 fBm unit ≈ 128 world px — big, soft, world-scale blobs.
    let cloud_scale : f32 = 1.0 / 128.0;

    // Slow horizontal drift; fBm is sampled at (world_x + drift_x, world_y).
    // Vertical drift is ~40% of horizontal for a gentle diagonal feel.
    let drift_x = cloud_u.drift_speed * cloud_u.time_sec;
    let drift_y = cloud_u.drift_speed * cloud_u.time_sec * 0.38;
    let sample_p = (wp + vec2<f32>(drift_x, drift_y)) * cloud_scale;

    let fbm_val = fbm3(sample_p);

    // Threshold to a soft blob mask, scaled by coverage.
    // Higher coverage → lower threshold → more of the fBm triggers a shadow.
    let cov = clamp(cloud_u.coverage, 0.0, 1.0);
    let thresh_hi = 1.0 - cov * 0.55;  // top quantization tier
    let thresh_lo = 1.0 - cov * 0.80;  // lower quantization tier

    // Quantize: step() gives crisp 0/1 — pixel-art friendly, no smooth gradients.
    let is_hi = step(thresh_hi, fbm_val);
    let is_lo = step(thresh_lo, fbm_val) * (1.0 - is_hi);

    // Max alpha low (0.14 * coverage): ambient darkening, not a solid shadow.
    let alpha_hi = 0.14 * cov;
    let alpha_lo = 0.08 * cov;

    let shadow_alpha = is_hi * alpha_hi + is_lo * alpha_lo;

    // Early-exit: transparent pixels contribute nothing; skip premult multiply cost.
    if shadow_alpha <= 0.0 {
        return vec4<f32>(0.0, 0.0, 0.0, 0.0);
    }

    // Premultiplied source-over output (no hex literals — color comes from EDG uniform).
    let rgb = cloud_u.shadow_color * shadow_alpha;
    return vec4<f32>(rgb, shadow_alpha);
}
