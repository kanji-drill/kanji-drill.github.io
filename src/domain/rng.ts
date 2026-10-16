export type Rng = () => number;

/** seed 付きの擬似乱数。同じ seed なら同じ問題が再現できる */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) >>> 0;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/** 重みに比例して 1 つ選ぶ。重みがすべて 0 なら undefined */
export function weightedPick<T>(items: readonly T[], weight: (item: T) => number, rng: Rng): T | undefined {
  const weights = items.map(weight);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0) return undefined;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] as number;
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}
