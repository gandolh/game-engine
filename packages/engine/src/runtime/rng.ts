export interface Rng {
  readonly seed: number;
  nextU32(): number;
  nextFloat(): number;
  range(min: number, max: number): number;
  int(minInclusive: number, maxExclusive: number): number;
  pick<T>(arr: readonly T[]): T;
  fork(label: string): Rng;
  snapshot(): RngState;
}

export interface RngState {
  seed: number;
  state: number;
}

export function createRng(seed: number): Rng {
  return new Mulberry32(seed >>> 0, seed >>> 0);
}

export function restoreRng(state: RngState): Rng {
  return new Mulberry32(state.seed >>> 0, state.state >>> 0);
}

class Mulberry32 implements Rng {
  readonly seed: number;
  private s: number;

  constructor(seed: number, state: number) {
    this.seed = seed;
    this.s = state;
  }

  nextU32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  nextFloat(): number {
    return this.nextU32() / 0x1_0000_0000;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.nextFloat();
  }

  int(minInclusive: number, maxExclusive: number): number {
    return minInclusive + Math.floor(this.nextFloat() * (maxExclusive - minInclusive));
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick: empty array");
    return arr[this.int(0, arr.length)]!;
  }

  fork(label: string): Rng {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < label.length; i++) {
      h ^= label.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const derived = (this.nextU32() ^ h) >>> 0;
    return new Mulberry32(derived, derived);
  }

  snapshot(): RngState {
    return { seed: this.seed, state: this.s };
  }
}
