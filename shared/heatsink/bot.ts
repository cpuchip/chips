// The house bot — an EV-greedy player built from the strategy research
// (docs/research/skyjo.md). It deliberately takes the REDACTED view, the same
// information a human at the table has, so it provably cannot cheat.
//
// Policy sketch:
// - Unknown cards carry the honest deck-mean prior (≈5.07 heat).
// - Every candidate placement is scored by its expected change to our board
//   sum, including etch completions (three-of-a-kind columns vanishing).
// - Take the discard when it's a solid gain or completes an etch; otherwise
//   draw. Place a drawn card on any real improvement; otherwise toss it and
//   flip — preferring a cell that might complete an etch.
// - Avoid closing the round unless our estimated total looks strictly lowest
//   (the closer-doubling rule punishes overconfident closes).

import { randInt, type Rng } from '../rng.ts'
import { deckMean } from './deck.ts'
import { COLS, ROWS, type Action, type CellView, type HeatsinkView, type PlayerView } from './types.ts'

const EV_UNKNOWN = deckMean() // ≈ 5.07

/** How good does the top discard have to be (expected heat shed) to take it? */
const TAKE_DISCARD_THRESHOLD = -4
/** Any improvement at least this good keeps a drawn card. */
const PLACE_THRESHOLD = -1
/** Penalty applied to moves that would close the round while not clearly lowest. */
const BAD_CLOSE_PENALTY = 12

function cellEV(c: CellView | null): number {
  if (c === null) return 0 // etched
  return c.up ? c.v! : EV_UNKNOWN
}

function gridEV(p: PlayerView): number {
  return p.grid.reduce((s, c) => s + cellEV(c), 0)
}

function faceDownCells(p: PlayerView): number[] {
  const out: number[] = []
  p.grid.forEach((c, i) => {
    if (c !== null && !c.up) out.push(i)
  })
  return out
}

function columnCells(col: number): number[] {
  return [0, 1, 2].map((r) => col * ROWS + r)
}

/**
 * Expected board-sum change from swapping value v into cell i (etch-aware).
 * Lower is better.
 */
function placementDelta(p: PlayerView, i: number, v: number): number {
  const target = p.grid[i]
  if (target === null) return Infinity // illegal
  const col = Math.floor(i / ROWS)
  const others = columnCells(col).filter((j) => j !== i).map((j) => p.grid[j])
  const completesEtch = others.every((c) => c !== null && c.up && c.v === v)
  if (completesEtch) {
    // The whole column vanishes: we shed the target's expected value AND the
    // two matching cards already showing.
    return -(cellEV(target) + others.reduce((s, c) => s + cellEV(c), 0))
  }
  return v - cellEV(target)
}

function bestPlacement(p: PlayerView, v: number): { cell: number; delta: number } {
  let cell = -1
  let delta = Infinity
  for (let i = 0; i < p.grid.length; i++) {
    const d = placementDelta(p, i, v)
    if (d < delta) {
      delta = d
      cell = i
    }
  }
  return { cell, delta }
}

/** Would revealing/replacing at `cell` leave every remaining cell face-up? */
function moveCloses(p: PlayerView, cell: number): boolean {
  return p.grid.every((c, i) => c === null || c.up || i === cell)
}

/** Our estimated final heat vs. the best other estimate. */
function closeLooksSafe(view: HeatsinkView, me: number): boolean {
  const mine = gridEV(view.players[me])
  let bestOther = Infinity
  view.players.forEach((p, i) => {
    if (i !== me) bestOther = Math.min(bestOther, gridEV(p))
  })
  return mine < bestOther - 1
}

/** Flip preference: a cell that could complete an etch, else random face-down. */
function chooseFlip(p: PlayerView, rng: Rng): number {
  const down = faceDownCells(p)
  for (let col = 0; col < COLS; col++) {
    const cells = columnCells(col).map((j) => p.grid[j])
    const ups = cells.filter((c): c is CellView => c !== null && c.up)
    if (ups.length === 2 && ups[0].v === ups[1].v) {
      const target = columnCells(col).find((j) => p.grid[j] !== null && !p.grid[j]!.up)
      if (target !== undefined) return target
    }
  }
  return down[randInt(down.length, rng)]
}

/**
 * Decide the bot's next atomic action. Call repeatedly: a drawDeck decision is
 * followed (next call) by a placeHeld/discardHeld decision on the same turn.
 */
export function botAction(view: HeatsinkView, me: number, rng: Rng): Action {
  const p = view.players[me]

  if (view.phase === 'flip') {
    // Flip two cells of the same column — the researched opener.
    const done = p.grid.filter((c) => c && c.up).length
    if (done === 0) {
      const col = randInt(COLS, rng)
      return { t: 'flip', cell: columnCells(col)[randInt(ROWS, rng)] }
    }
    const upIdx = p.grid.findIndex((c) => c && c.up)
    const col = Math.floor(upIdx / ROWS)
    const sameCol = columnCells(col).filter((j) => p.grid[j] !== null && !p.grid[j]!.up)
    if (sameCol.length > 0) return { t: 'flip', cell: sameCol[randInt(sameCol.length, rng)] }
    const down = faceDownCells(p)
    return { t: 'flip', cell: down[randInt(down.length, rng)] }
  }

  const closePenalty = (cell: number, delta: number): number =>
    moveCloses(p, cell) && !closeLooksSafe(view, me) ? delta + BAD_CLOSE_PENALTY : delta

  if (view.held !== null) {
    const { cell, delta } = bestPlacement(p, view.held)
    const down = faceDownCells(p)
    if (down.length === 0) return { t: 'placeHeld', cell } // no flip available
    const flipCell = chooseFlip(p, rng)
    const placeScore = closePenalty(cell, delta)
    const flipScore = closePenalty(flipCell, 0) // a flip doesn't change expected sum
    if (placeScore <= PLACE_THRESHOLD && placeScore <= flipScore) {
      return { t: 'placeHeld', cell }
    }
    return { t: 'discardHeld', cell: flipCell }
  }

  // Turn start: known discard vs. unknown draw.
  if (view.discardTop !== null) {
    const { cell, delta } = bestPlacement(p, view.discardTop)
    const score = closePenalty(cell, delta)
    const completesEtch = delta < -EV_UNKNOWN - 1 // etch deltas are large
    if (score <= TAKE_DISCARD_THRESHOLD || (completesEtch && score < 0)) {
      return { t: 'takeDiscard', cell }
    }
  }
  return { t: 'drawDeck' }
}
