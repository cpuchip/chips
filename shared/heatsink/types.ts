// Heatsink — types. A golf-family card game: you're assembling a chip and the
// coolest board wins. Card values are heat, −2 (heatsink) through 12 (scorching).
//
// Grid is column-major: 4 columns × 3 rows, cell index = col*3 + row.
// A column whose three face-up cells match is "etched" — optimized away, scores 0.

export const COLS = 4
export const ROWS = 3
export const GRID_SIZE = COLS * ROWS // 12

export const MIN_HEAT = -2
export const MAX_HEAT = 12

/** Round-total that ends the game: lowest cumulative heat wins. */
export const GAME_OVER_AT = 100

/** One grid cell. `null` in a Grid means the cell was etched away. */
export interface Cell {
  v: number // heat value, −2..12
  up: boolean // face-up?
}

export type Grid = (Cell | null)[] // length 12

export type Phase =
  | 'flip' // players each flip 2 starting cells; highest sum leads
  | 'play' // normal turns (including final turns after a closer)
  | 'roundEnd' // reveal + scores shown; awaiting next round
  | 'gameOver'

export interface PlayerRound {
  grid: Grid
  /** flip phase: indices flipped so far this phase (0–2 of them) */
  initialFlips: number[]
}

export interface HeatsinkState {
  phase: Phase
  round: number // 1-based
  players: PlayerRound[]
  drawPile: number[] // face-down values; last = top. Server truth — redact!
  discard: number[] // face-up values; last = top
  turn: number // player index whose turn it is (phase 'play')
  /** card drawn from the deck this turn, awaiting place/discard (public info) */
  held: number | null
  /** player who first went fully face-up; everyone after gets one last turn */
  closer: number | null
  /** seats (in order) that still get a final turn once closer is set */
  finalQueue: number[]
  totals: number[] // cumulative scores across rounds
  /** set during roundEnd/gameOver: this round's scores (after any doubling) */
  roundScores: number[] | null
  /** did the closer's score double this round? (for the UI callout) */
  closerDoubled: boolean
  winners: number[] | null // set at gameOver: lowest total (ties share)
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type Action =
  | { t: 'flip'; cell: number } // flip phase: reveal one of your own cells
  | { t: 'takeDiscard'; cell: number } // must swap top discard into `cell`
  | { t: 'drawDeck' } // draw → becomes `held`
  | { t: 'placeHeld'; cell: number } // swap held into `cell`
  | { t: 'discardHeld'; cell: number } // toss held; must flip face-down `cell`

// ── Redacted view (what clients see) ─────────────────────────────────────────

export interface CellView {
  v: number | null // null while face-down — value never leaves the server
  up: boolean
}

export interface PlayerView {
  grid: (CellView | null)[]
  initialFlipsDone: number
}

export interface HeatsinkView {
  phase: Phase
  round: number
  players: PlayerView[]
  drawCount: number
  discardTop: number | null
  discardCount: number
  turn: number
  held: number | null
  closer: number | null
  totals: number[]
  roundScores: number[] | null
  closerDoubled: boolean
  winners: number[] | null
}
