// Heatsink engine — the authoritative state machine. Pure and deterministic:
// all randomness comes through the injected Rng. The server owns a HeatsinkState
// per table and applies validated Actions; clients only ever see view().
//
// Rules (ratified 2026-07-02, see docs/research/skyjo.md):
// - 150-card deck (−2..12), 12 cards each in a 4×3 grid, flip 2 to start,
//   highest revealed sum leads the round.
// - A turn: take the top discard (must swap it in), OR draw (then swap, or
//   discard it and flip one of your face-down cells).
// - Etching: three matching face-up cells in a column vanish to the discard.
//   Applies however the third match appears — swap, flip, or end-of-round reveal.
// - Round ends when someone is fully face-up; everyone else gets one turn.
//   The closer must be STRICTLY lowest or their positive round score doubles
//   (tie ⇒ doubled — our ruling on the original's ambiguity).
// - Game over when a total reaches 100; lowest total wins.

import { type Rng } from '../rng.ts'
import { freshDeck } from './deck.ts'
import {
  COLS,
  ROWS,
  GRID_SIZE,
  GAME_OVER_AT,
  type Action,
  type Cell,
  type Grid,
  type HeatsinkState,
  type HeatsinkView,
} from './types.ts'

export class RuleError extends Error {}

function fail(msg: string): never {
  throw new RuleError(msg)
}

// ── Setup ────────────────────────────────────────────────────────────────────

export function newGame(numPlayers: number, rng: Rng): HeatsinkState {
  if (numPlayers < 2 || numPlayers > 8) fail('2–8 players')
  const state: HeatsinkState = {
    phase: 'flip',
    round: 0,
    players: [],
    drawPile: [],
    discard: [],
    turn: 0,
    held: null,
    closer: null,
    finalQueue: [],
    totals: new Array(numPlayers).fill(0),
    roundScores: null,
    closerDoubled: false,
    winners: null,
  }
  dealRound(state, rng)
  return state
}

/** Deal a fresh round: full reshuffled deck, new grids, flip phase. */
export function dealRound(state: HeatsinkState, rng: Rng): void {
  const n = state.totals.length
  const deck = freshDeck(rng)
  state.players = []
  for (let p = 0; p < n; p++) {
    const grid: Grid = []
    for (let i = 0; i < GRID_SIZE; i++) {
      grid.push({ v: deck.pop()!, up: false })
    }
    state.players.push({ grid, initialFlips: [] })
  }
  state.discard = [deck.pop()!]
  state.drawPile = deck
  state.phase = 'flip'
  state.round += 1
  state.turn = 0
  state.held = null
  state.closer = null
  state.finalQueue = []
  state.roundScores = null
  state.closerDoubled = false
}

// ── Grid helpers ─────────────────────────────────────────────────────────────

/** Cell index for (col, row) in the column-major grid. */
export function cellIndex(col: number, row: number): number {
  return col * ROWS + row
}

export function columnOf(cell: number): number {
  return Math.floor(cell / ROWS)
}

/** Sum of face-up cells (etched cells are gone and score 0). */
export function faceUpSum(grid: Grid): number {
  let s = 0
  for (const c of grid) if (c && c.up) s += c.v
  return s
}

/** True when every remaining (non-etched) cell is face-up. */
export function fullyRevealed(grid: Grid): boolean {
  return grid.every((c) => c === null || c.up)
}

export function faceDownCount(grid: Grid): number {
  return grid.filter((c) => c !== null && !c.up).length
}

/**
 * Etch any column whose three cells are all face-up with equal values: remove
 * them from the grid onto the discard pile. Loops until stable (a reveal can
 * complete more than one column at once). Returns the number of columns etched.
 */
export function etchColumns(grid: Grid, discard: number[]): number {
  let etched = 0
  for (let col = 0; col < COLS; col++) {
    const idx = [0, 1, 2].map((r) => cellIndex(col, r))
    const cells = idx.map((i) => grid[i])
    if (cells.every((c): c is Cell => c !== null && c.up) && cells[0]!.v === cells[1]!.v && cells[1]!.v === cells[2]!.v) {
      for (const i of idx) {
        discard.push(grid[i]!.v)
        grid[i] = null
      }
      etched++
    }
  }
  return etched
}

// ── Turn machinery ───────────────────────────────────────────────────────────

function requirePhase(state: HeatsinkState, phase: HeatsinkState['phase']): void {
  if (state.phase !== phase) fail(`wrong phase: ${state.phase}, need ${phase}`)
}

function requireTurn(state: HeatsinkState, player: number): void {
  requirePhase(state, 'play')
  if (state.turn !== player) fail(`not player ${player}'s turn`)
}

function drawTop(state: HeatsinkState, rng: Rng): number {
  if (state.drawPile.length === 0) {
    // Reshuffle the discard (except its top card) into a new draw pile.
    const top = state.discard.pop()!
    state.drawPile = state.discard
    state.discard = [top]
    // Rare in practice, but shuffle deterministically like everything else.
    shuffleInPlace(state.drawPile, rng)
    if (state.drawPile.length === 0) fail('deck exhausted') // unreachable: discard grows every turn
  }
  return state.drawPile.pop()!
}

function shuffleInPlace(arr: number[], rng: Rng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
}

/** Validate a swap target BEFORE any mutation — keeps failed actions atomic. */
function assertSwapTarget(state: HeatsinkState, player: number, cell: number): void {
  if (cell < 0 || cell >= GRID_SIZE) fail('bad cell')
  if (state.players[player].grid[cell] === null) fail('cell was etched away')
}

/** Swap a card value into a (pre-validated) grid cell; displaced card to discard. */
function swapIntoGrid(state: HeatsinkState, player: number, cell: number, v: number): void {
  const grid = state.players[player].grid
  state.discard.push(grid[cell]!.v)
  grid[cell] = { v, up: true }
  etchColumns(grid, state.discard)
}

/**
 * Finish the acting player's turn: check whether they closed the round, track
 * final turns, advance to the next seat (or end the round).
 */
function endTurn(state: HeatsinkState, player: number): void {
  const n = state.players.length
  if (state.closer === null && fullyRevealed(state.players[player].grid)) {
    // This player closed: everyone else gets exactly one more turn, in seat order.
    state.closer = player
    state.finalQueue = []
    for (let i = 1; i < n; i++) state.finalQueue.push((player + i) % n)
  } else if (state.closer !== null) {
    // A final turn was just used.
    state.finalQueue = state.finalQueue.filter((p) => p !== player)
  }

  if (state.closer !== null) {
    if (state.finalQueue.length === 0) {
      endRound(state)
      return
    }
    state.turn = state.finalQueue[0]
  } else {
    state.turn = (player + 1) % n
  }
}

// ── Round scoring ────────────────────────────────────────────────────────────

function endRound(state: HeatsinkState): void {
  // Reveal everything; reveals can still complete columns (etch applies).
  for (const p of state.players) {
    for (const c of p.grid) if (c) c.up = true
    etchColumns(p.grid, state.discard)
  }

  const n = state.players.length
  const scores = state.players.map((p) => faceUpSum(p.grid))

  // The closer's gamble: strictly lowest or (positive) score doubles.
  state.closerDoubled = false
  if (state.closer !== null) {
    const c = state.closer
    const strictlyLowest = scores.every((s, i) => i === c || scores[c] < s)
    if (!strictlyLowest && scores[c] > 0) {
      scores[c] *= 2
      state.closerDoubled = true
    }
  }

  state.roundScores = scores
  for (let i = 0; i < n; i++) state.totals[i] += scores[i]

  if (state.totals.some((t) => t >= GAME_OVER_AT)) {
    state.phase = 'gameOver'
    const best = Math.min(...state.totals)
    state.winners = state.totals.map((t, i) => (t === best ? i : -1)).filter((i) => i >= 0)
  } else {
    state.phase = 'roundEnd'
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Apply a validated action for `player`. Throws RuleError on illegal moves. */
export function apply(state: HeatsinkState, player: number, action: Action, rng: Rng): void {
  if (player < 0 || player >= state.players.length) fail('bad player')

  switch (action.t) {
    case 'flip': {
      requirePhase(state, 'flip')
      const pr = state.players[player]
      if (pr.initialFlips.length >= 2) fail('already flipped two')
      const cell = pr.grid[action.cell]
      if (action.cell < 0 || action.cell >= GRID_SIZE || !cell) fail('bad cell')
      if (cell.up) fail('cell already face-up')
      cell.up = true
      pr.initialFlips.push(action.cell)
      maybeStartPlay(state)
      return
    }
    case 'takeDiscard': {
      requireTurn(state, player)
      if (state.held !== null) fail('already holding a drawn card')
      if (state.discard.length === 0) fail('discard empty')
      assertSwapTarget(state, player, action.cell)
      const v = state.discard.pop()!
      swapIntoGrid(state, player, action.cell, v)
      endTurn(state, player)
      return
    }
    case 'drawDeck': {
      requireTurn(state, player)
      if (state.held !== null) fail('already holding a drawn card')
      state.held = drawTop(state, rng)
      return
    }
    case 'placeHeld': {
      requireTurn(state, player)
      if (state.held === null) fail('nothing held')
      assertSwapTarget(state, player, action.cell)
      const v = state.held
      state.held = null
      swapIntoGrid(state, player, action.cell, v)
      endTurn(state, player)
      return
    }
    case 'discardHeld': {
      requireTurn(state, player)
      if (state.held === null) fail('nothing held')
      const grid = state.players[player].grid
      const cell = grid[action.cell]
      if (action.cell < 0 || action.cell >= GRID_SIZE || !cell) fail('bad cell')
      if (cell.up) fail('must flip a face-down cell')
      state.discard.push(state.held)
      state.held = null
      cell.up = true
      etchColumns(grid, state.discard)
      endTurn(state, player)
      return
    }
  }
}

/** Once every player has flipped two cells, the highest revealed sum leads. */
function maybeStartPlay(state: HeatsinkState): void {
  if (!state.players.every((p) => p.initialFlips.length === 2)) return
  let lead = 0
  let bestSum = -Infinity
  for (let i = 0; i < state.players.length; i++) {
    const s = faceUpSum(state.players[i].grid)
    if (s > bestSum) {
      bestSum = s
      lead = i
    }
  }
  state.turn = lead
  state.phase = 'play'
}

/** Advance from roundEnd to the next round's flip phase. */
export function nextRound(state: HeatsinkState, rng: Rng): void {
  requirePhase(state, 'roundEnd')
  dealRound(state, rng)
}

// ── Redacted view ────────────────────────────────────────────────────────────

/**
 * What clients are allowed to see. Face-down card values NEVER leave the
 * server — nobody (including the owner) knows a face-down card in this family
 * of games, so one public view serves every seat.
 */
export function view(state: HeatsinkState): HeatsinkView {
  return {
    phase: state.phase,
    round: state.round,
    players: state.players.map((p) => ({
      grid: p.grid.map((c) => (c === null ? null : { v: c.up ? c.v : null, up: c.up })),
      initialFlipsDone: p.initialFlips.length,
    })),
    drawCount: state.drawPile.length,
    discardTop: state.discard.length ? state.discard[state.discard.length - 1] : null,
    discardCount: state.discard.length,
    turn: state.turn,
    held: state.held,
    closer: state.closer,
    totals: [...state.totals],
    roundScores: state.roundScores ? [...state.roundScores] : null,
    closerDoubled: state.closerDoubled,
    winners: state.winners ? [...state.winners] : null,
  }
}
