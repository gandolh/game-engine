
export function shouldStopSkip(
  prevLen: number,
  curLen: number,
  newestDrama: number,
  threshold: number,
): boolean {
  return curLen > prevLen && newestDrama >= threshold;
}

export const SKIP_MAX_DAYS = 30;
