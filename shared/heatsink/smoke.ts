// Heatsink oracle — deterministic assertions over the engine + bot.
// Run: npm run smoke. Green before every commit (the house discipline).
//
// Includes inverse-hypothesis cases: illegal actions MUST throw, and a failed
// action MUST leave state untouched (atomicity). A test that can't fail
// proves nothing.

import { mulberry32 } from '../rng.ts'
import { DECK_TOTAL, deckComposition, deckMean, freshDeck } from './deck.ts'
import {
  apply,
  cellIndex,
  faceUpSum,
  fullyRevealed,
  newGame,
  nextRound,
  RuleError,
  view,
} from './engine.ts'
import { botAction } from './bot.ts'
import { GRID_SIZE, type Cell, type HeatsinkState } from './types.ts'

let passed = 0
let failed = 0

function ok(cond: boolean, name: string): void {
  if (cond) {
    passed++
    console.log(`  ok  ${name}`)
  } else {
    failed++
    console.error(`FAIL  ${name}`)
  }
}

function throws(fn: () => void, name: string): void {
  try {
    fn()
    failed++
    console.error(`FAIL  ${name} (did not throw)`)
  } catch (e) {
    if (e instanceof RuleError) {
      passed++
      console.log(`  ok  ${name}`)
    } else {
      failed++
      console.error(`FAIL  ${name} (wrong error: ${e})`)
    }
  }
}

/** Sorted multiset of every card anywhere in the state. */
function multisetOf(s: HeatsinkState): string {
  const all: number[] = []
  for (const p of s.players) for (const c of p.grid) if (c) all.push(c.v)
  all.push(...s.drawPile, ...s.discard)
  if (s.held !== null) all.push(s.held)
  return all.sort((a, b) => a - b).join(',')
}

/** Full-deck conservation — for states dealt by the real engine. */
function conservationHolds(s: HeatsinkState): boolean {
  const counts = new Map<number, number>()
  const add = (v: number) => counts.set(v, (counts.get(v) ?? 0) + 1)
  for (const p of s.players) for (const c of p.grid) if (c) add(c.v)
  for (const v of s.drawPile) add(v)
  for (const v of s.discard) add(v)
  if (s.held !== null) add(s.held)
  const want = deckComposition()
  if (counts.size !== want.size) return false
  for (const [v, n] of want) if (counts.get(v) !== n) return false
  return true
}

// ── 1. Deck ──────────────────────────────────────────────────────────────────
console.log('deck')
{
  const deck = freshDeck(mulberry32(1))
  ok(deck.length === DECK_TOTAL, 'deck has 150 cards')
  const counts = new Map<number, number>()
  for (const v of deck) counts.set(v, (counts.get(v) ?? 0) + 1)
  ok(counts.get(-2) === 5, '−2 ×5')
  ok(counts.get(-1) === 10, '−1 ×10')
  ok(counts.get(0) === 15, '0 ×15')
  ok([...Array(12)].every((_, i) => counts.get(i + 1) === 10), '1..12 ×10 each')
  ok(Math.abs(deckMean() - 760 / 150) < 1e-12, 'deck mean ≈ 5.067')
}

// ── 2. Determinism ───────────────────────────────────────────────────────────
console.log('determinism')
{
  const a = newGame(4, mulberry32(42))
  const b = newGame(4, mulberry32(42))
  ok(JSON.stringify(a) === JSON.stringify(b), 'same seed → identical deal')
  const c = newGame(4, mulberry32(43))
  ok(JSON.stringify(a) !== JSON.stringify(c), 'different seed → different deal')
}

// ── 3. Setup + flip phase ────────────────────────────────────────────────────
console.log('setup + flip')
{
  const rng = mulberry32(7)
  const s = newGame(3, rng)
  ok(s.phase === 'flip', 'starts in flip phase')
  ok(s.players.length === 3 && s.players.every((p) => p.grid.length === GRID_SIZE), '3 grids of 12')
  ok(s.drawPile.length === 150 - 36 - 1, 'draw pile = 150 − dealt − 1 discard')
  ok(s.discard.length === 1, 'one card starts the discard')
  ok(conservationHolds(s), 'conservation after deal')

  // Everyone flips two: rig the values so player 2 has the highest sum.
  s.players[0].grid[0] = { v: 1, up: false }
  s.players[0].grid[1] = { v: 1, up: false }
  s.players[1].grid[0] = { v: 5, up: false }
  s.players[1].grid[1] = { v: 5, up: false }
  s.players[2].grid[0] = { v: 12, up: false }
  s.players[2].grid[1] = { v: 11, up: false }
  for (let p = 0; p < 3; p++) {
    apply(s, p, { t: 'flip', cell: 0 }, rng)
    apply(s, p, { t: 'flip', cell: 1 }, rng)
  }
  ok(s.phase === 'play', 'all flipped → play')
  ok(s.turn === 2, 'highest revealed sum leads')
}

/** Build a bare 2-player mid-round state with full control over the cards. */
function rig(opts: {
  p0: Cell[]
  p1: Cell[]
  draw: number[]
  discard: number[]
  turn?: number
}): HeatsinkState {
  return {
    phase: 'play',
    round: 1,
    players: [
      { grid: [...opts.p0], initialFlips: [0, 1] },
      { grid: [...opts.p1], initialFlips: [0, 1] },
    ],
    drawPile: [...opts.draw],
    discard: [...opts.discard],
    turn: opts.turn ?? 0,
    held: null,
    closer: null,
    finalQueue: [],
    totals: [0, 0],
    roundScores: null,
    closerDoubled: false,
    winners: null,
  }
}

/** A 12-cell grid from a value list; `up` marks which indices start face-up. */
function grid(values: number[], up: number[] = []): Cell[] {
  return values.map((v, i) => ({ v, up: up.includes(i) }))
}

const FLAT = [5, 6, 7, 1, 2, 3, 4, 8, 9, 5, 6, 7] // no column triples anywhere

// ── 4. Turn actions ──────────────────────────────────────────────────────────
console.log('turn actions')
{
  const rng = mulberry32(9)
  // takeDiscard: must swap; displaced card lands on the discard.
  const s = rig({ p0: grid(FLAT, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [4, 4, 4], discard: [-2] })
  apply(s, 0, { t: 'takeDiscard', cell: 5 }, rng)
  ok(s.players[0].grid[5]!.v === -2 && s.players[0].grid[5]!.up, 'discard swapped in face-up')
  ok(s.discard[s.discard.length - 1] === FLAT[5], 'displaced card tops the discard')
  ok(s.turn === 1, 'turn advanced')

  // drawDeck → placeHeld
  const s2 = rig({ p0: grid(FLAT, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [0, 9], discard: [3] })
  apply(s2, 0, { t: 'drawDeck' }, rng)
  ok(s2.held === 9, 'drawn card held (top of pile)')
  apply(s2, 0, { t: 'placeHeld', cell: 7 }, rng)
  ok(s2.players[0].grid[7]!.v === 9 && s2.held === null, 'held placed')
  ok(s2.discard[s2.discard.length - 1] === FLAT[7], 'displaced to discard')

  // drawDeck → discardHeld must flip a face-down cell
  const s3 = rig({ p0: grid(FLAT, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [0, 9], discard: [3] })
  apply(s3, 0, { t: 'drawDeck' }, rng)
  apply(s3, 0, { t: 'discardHeld', cell: 11 }, rng)
  ok(s3.players[0].grid[11]!.up, 'forced flip happened')
  ok(s3.discard[s3.discard.length - 1] === 9, 'held card discarded')
}

// ── 5. Etching (column elimination) ──────────────────────────────────────────
console.log('etching')
{
  const rng = mulberry32(11)
  // Column 1 = cells 3,4,5. Two 8s face-up, third cell face-up non-matching:
  // placing the third 8 etches the column.
  const vals = [...FLAT]
  vals[3] = 8
  vals[4] = 8
  vals[5] = 2
  const s = rig({ p0: grid(vals, [3, 4, 5]), p1: grid(FLAT, [0, 1]), draw: [1, 1], discard: [8] })
  const before = multisetOf(s)
  apply(s, 0, { t: 'takeDiscard', cell: 5 }, rng)
  ok(s.players[0].grid[3] === null && s.players[0].grid[4] === null && s.players[0].grid[5] === null, 'column etched on swap-complete')
  ok(multisetOf(s) === before, 'etched cards conserved on discard')

  // Etch via forced flip: two 4s face-up, face-down third IS a 4.
  const vals2 = [...FLAT]
  vals2[6] = 4
  vals2[7] = 4
  vals2[8] = 4
  const s2 = rig({ p0: grid(vals2, [6, 7]), p1: grid(FLAT, [0, 1]), draw: [0, 12], discard: [3] })
  apply(s2, 0, { t: 'drawDeck' }, rng)
  apply(s2, 0, { t: 'discardHeld', cell: 8 }, rng)
  ok(s2.players[0].grid[6] === null, 'column etched on flip-complete')

  // Negative columns etch too (three −1s — the rule, not a choice).
  const vals3 = [...FLAT]
  vals3[0] = -1
  vals3[1] = -1
  vals3[2] = -1
  const s3 = rig({ p0: grid(vals3, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [0, 12], discard: [3] })
  apply(s3, 0, { t: 'drawDeck' }, rng)
  apply(s3, 0, { t: 'discardHeld', cell: 2 }, rng)
  ok(s3.players[0].grid[0] === null, 'negative column etches (like it or not)')
}

// ── 6. Round close + the closer's gamble ─────────────────────────────────────
console.log('round close')

/**
 * Drive a rigged 2-player state to round end: p0 flips their last cell (cell 11)
 * to close, then p1 takes their final turn (draw + flip cell 11).
 */
function playOut(p0vals: number[], p1vals: number[], draw: number[]): HeatsinkState {
  const upAllBut11 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const s = rig({ p0: grid(p0vals, upAllBut11), p1: grid(p1vals, upAllBut11), draw, discard: [3] })
  const rng = mulberry32(13)
  apply(s, 0, { t: 'drawDeck' }, rng)
  apply(s, 0, { t: 'discardHeld', cell: 11 }, rng) // p0 fully revealed → closer
  if (s.phase !== 'play') return s
  apply(s, 1, { t: 'drawDeck' }, rng)
  apply(s, 1, { t: 'discardHeld', cell: 11 }, rng) // p1's final turn → round ends
  return s
}

{
  // Closer strictly lowest → no doubling. FLAT sums to 63; give p0 a −2 grid edge.
  const p0 = [...FLAT]
  p0[0] = -2 // p0 sum 56 vs p1 63
  const s = playOut(p0, FLAT, [0, 0])
  ok(s.phase === 'roundEnd', 'round ended after final turns')
  ok(s.closer === 0, 'p0 is the closer')
  ok(!s.closerDoubled && s.roundScores![0] === 56, 'strictly lowest → no double')

  // Tie → doubled (our ruling on the original's ambiguity).
  const s2 = playOut(FLAT, FLAT, [0, 0])
  ok(s2.closerDoubled && s2.roundScores![0] === 126 && s2.roundScores![1] === 63, 'tie ⇒ closer doubles')

  // Closer higher → doubled.
  const p0hi = [...FLAT]
  p0hi[0] = 12 // p0 70 vs 63
  const s3 = playOut(p0hi, FLAT, [0, 0])
  ok(s3.closerDoubled && s3.roundScores![0] === 140, 'beaten closer doubles')

  // Negative closer score never doubles: closer NOT lowest but still negative
  // (p0 −3 vs p1 −5).
  const c0 = [-2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] // −3
  const c1 = [-2, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0] // −5
  const s4 = playOut(c0, c1, [0, 0])
  ok(!s4.closerDoubled && s4.roundScores![0] === -3, 'negative closer score not doubled')

  // Totals accumulate; nextRound redeals.
  const rng = mulberry32(17)
  ok(s.totals[0] === 56 && s.totals[1] === 63, 'totals accumulated')
  nextRound(s, rng)
  ok(s.phase === 'flip' && s.round === 2, 'next round deals + returns to flip')
  ok(conservationHolds(s), 'conservation after redeal')
}

// ── 7. Etch on final reveal ──────────────────────────────────────────────────
console.log('final reveal etch')
{
  // p1's column 3 (cells 9,10,11) all hold 7s, face-DOWN cells 9,10 at close:
  // the end-of-round reveal must etch them.
  const p1vals = [...FLAT]
  p1vals[9] = 7
  p1vals[10] = 7
  p1vals[11] = 7
  const upAllBut11 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const s = rig({
    p0: grid(FLAT, upAllBut11),
    p1: grid(p1vals, [0, 1, 2, 3, 4, 5, 6, 7, 8]), // 9,10,11 face-down
    draw: [0, 0, 0],
    discard: [3],
  })
  const before = multisetOf(s)
  const rng = mulberry32(19)
  apply(s, 0, { t: 'drawDeck' }, rng)
  apply(s, 0, { t: 'discardHeld', cell: 11 }, rng) // p0 closes
  apply(s, 1, { t: 'drawDeck' }, rng)
  apply(s, 1, { t: 'discardHeld', cell: 9 }, rng) // p1 final turn (flips 9; 10,11 stay down)
  // p0 scores 63, p1's etch drops them to 45 → the beaten closer doubles to
  // 126, crossing 100: this rigged round ends the whole game.
  ok(s.phase === 'gameOver', 'round (and game) over')
  ok(s.players[1].grid[9] === null && s.players[1].grid[10] === null && s.players[1].grid[11] === null, 'reveal-completed column etched')
  const expectP1 = FLAT.reduce((a, b) => a + b, 0) - FLAT[9] - FLAT[10] - FLAT[11]
  ok(s.roundScores![1] === expectP1, 'etched column scores zero')
  ok(s.closerDoubled && s.roundScores![0] === 126 && s.winners![0] === 1, 'doubled closer loses the game')
  ok(multisetOf(s) === before, 'conservation after reveal etch')
}

// ── 8. Illegal actions throw + leave state untouched ────────────────────────
console.log('illegal actions (inverse hypothesis)')
{
  const rng = mulberry32(23)
  const s = rig({ p0: grid(FLAT, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [4, 4], discard: [5] })
  const snapshot = JSON.stringify(s)
  throws(() => apply(s, 1, { t: 'drawDeck' }, rng), 'acting out of turn throws')
  throws(() => apply(s, 0, { t: 'placeHeld', cell: 0 }, rng), 'placing with nothing held throws')
  throws(() => apply(s, 0, { t: 'discardHeld', cell: 0 }, rng), 'discarding with nothing held throws')
  throws(() => apply(s, 0, { t: 'takeDiscard', cell: 99 }, rng), 'bad cell throws')
  throws(() => apply(s, 0, { t: 'flip', cell: 2 }, rng), 'flip outside flip phase throws')
  ok(JSON.stringify(s) === snapshot, 'failed actions left state untouched (atomicity)')

  // Swapping into an etched cell throws — including via takeDiscard (the
  // pop-before-validate bug this test pins down).
  const vals = [...FLAT]
  const s2 = rig({ p0: grid(vals, [0, 1]), p1: grid(vals, [0, 1]), draw: [4, 4], discard: [5] })
  s2.players[0].grid[3] = null
  s2.players[0].grid[4] = null
  s2.players[0].grid[5] = null
  const snap2 = JSON.stringify(s2)
  throws(() => apply(s2, 0, { t: 'takeDiscard', cell: 4 }, rng), 'takeDiscard onto etched cell throws')
  ok(JSON.stringify(s2) === snap2, 'discard pile untouched by the failed take')

  // Flipping an already-face-up cell after a discardHeld is illegal.
  apply(s2, 0, { t: 'drawDeck' }, rng)
  throws(() => apply(s2, 0, { t: 'discardHeld', cell: 0 }, rng), 'flipping a face-up cell throws')
}

// ── 9. View redaction ────────────────────────────────────────────────────────
console.log('redaction')
{
  const s = newGame(3, mulberry32(29))
  const v = view(s)
  const noLeaks = v.players.every((p) => p.grid.every((c) => c === null || c.up || c.v === null))
  ok(noLeaks, 'face-down values are null in the view')
  ok(!('drawPile' in v), 'draw pile contents absent from the view')
  ok(v.drawCount === s.drawPile.length, 'draw count exposed instead')
}

// ── 10. Deck exhaustion reshuffles the discard ───────────────────────────────
console.log('deck exhaustion')
{
  const rng = mulberry32(31)
  const s = rig({ p0: grid(FLAT, [0, 1]), p1: grid(FLAT, [0, 1]), draw: [9], discard: [5, 6, 7, 8] })
  const before = multisetOf(s)
  apply(s, 0, { t: 'drawDeck' }, rng) // takes the last draw card
  apply(s, 0, { t: 'discardHeld', cell: 2 }, rng)
  apply(s, 1, { t: 'drawDeck' }, rng) // draw pile empty → reshuffle discard-minus-top
  ok(s.held !== null, 'drew from reshuffled pile')
  ok(s.discard.length === 1, 'discard kept only its top card')
  apply(s, 1, { t: 'discardHeld', cell: 2 }, rng)
  ok(multisetOf(s) === before, 'conservation across reshuffle')
}

// ── 11. Bot-vs-bot simulations (the big invariant sweep) ─────────────────────
console.log('bot simulations')
{
  let games = 0
  let totalRounds = 0
  let roundScoreSum = 0
  let roundScoreCount = 0
  let doubles = 0
  for (let seed = 100; seed < 160; seed++) {
    const numPlayers = 2 + (seed % 7) // 2..8
    const rng = mulberry32(seed)
    const s = newGame(numPlayers, rng)
    let safety = 20000
    while (s.phase !== 'gameOver' && safety-- > 0) {
      if (s.phase === 'flip') {
        for (let p = 0; p < numPlayers; p++) {
          while (s.players[p].initialFlips.length < 2) {
            apply(s, p, botAction(view(s), p, rng), rng)
          }
        }
      } else if (s.phase === 'play') {
        apply(s, s.turn, botAction(view(s), s.turn, rng), rng)
      } else if (s.phase === 'roundEnd') {
        roundScoreSum += s.roundScores!.reduce((a, b) => a + b, 0)
        roundScoreCount += numPlayers
        if (s.closerDoubled) doubles++
        nextRound(s, rng)
      }
      if (!conservationHolds(s)) throw new Error(`conservation broke (seed ${seed})`)
    }
    if (safety <= 0) throw new Error(`game did not terminate (seed ${seed})`)
    const best = Math.min(...s.totals)
    if (!s.winners!.every((w) => s.totals[w] === best)) throw new Error('winner not lowest')
    games++
    totalRounds += s.round
  }
  ok(games === 60, `60 full bot games completed (${totalRounds} rounds)`)
  console.log(
    `      avg rounds/game ${(totalRounds / games).toFixed(1)}, avg round score ${(roundScoreSum / roundScoreCount).toFixed(1)}, closer-doubles ${doubles}`,
  )
  ok(totalRounds / games > 2 && totalRounds / games < 30, 'game length in a sane band')
}

// ── 12. cellIndex sanity ─────────────────────────────────────────────────────
console.log('grid math')
{
  ok(cellIndex(0, 0) === 0 && cellIndex(0, 2) === 2 && cellIndex(3, 2) === 11, 'column-major indexing')
  const g = grid(FLAT, [0, 1, 2, 3])
  ok(faceUpSum(g) === FLAT[0] + FLAT[1] + FLAT[2] + FLAT[3], 'faceUpSum counts only face-up')
  ok(!fullyRevealed(g), 'not fully revealed with face-down cells')
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
