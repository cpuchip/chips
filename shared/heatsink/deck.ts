// The Heatsink deck: 150 cards, heat values −2..12.
// Composition (verified against the golf-family original this derives from):
//   −2 ×5 · −1 ×10 · 0 ×15 · 1..12 ×10 each  →  5+10+15+120 = 150
// The fat zero count makes "safe" boards common; −2 heatsinks are rare treasure.

import { shuffle, type Rng } from '../rng.ts'

export const DECK_TOTAL = 150

export function deckComposition(): Map<number, number> {
  const m = new Map<number, number>()
  m.set(-2, 5)
  m.set(-1, 10)
  m.set(0, 15)
  for (let v = 1; v <= 12; v++) m.set(v, 10)
  return m
}

export function freshDeck(rng: Rng): number[] {
  const cards: number[] = []
  for (const [v, n] of deckComposition()) {
    for (let i = 0; i < n; i++) cards.push(v)
  }
  return shuffle(cards, rng)
}

/** Mean value of the full deck (≈5.07) — the honest prior for an unknown card. */
export function deckMean(): number {
  let sum = 0
  let n = 0
  for (const [v, c] of deckComposition()) {
    sum += v * c
    n += c
  }
  return sum / n
}
