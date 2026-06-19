

export function linear(t: number): number {
  return t;
}

export function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

export function easeOutBack(t: number, overshoot = 1.70158): number {
  const c = overshoot + 1;
  const u = t - 1;
  return 1 + c * u * u * u + overshoot * u * u;
}

export function easeOutElastic(t: number, period = 0.3): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const s = period / 4;
  return Math.pow(2, -10 * t) * Math.sin(((t - s) * (2 * Math.PI)) / period) + 1;
}
