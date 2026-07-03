// Seeded PRNG — mulberry32. Deterministic deals: same seed, same shuffle,
// everywhere. shared/ code must use an injected Rng, never bare Math.random().

export type Rng = () => number // uniform [0, 1)

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates in place. */
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** Random int in [0, n). */
export function randInt(n: number, rng: Rng): number {
  return Math.floor(rng() * n)
}
