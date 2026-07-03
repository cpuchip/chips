// Turn state transitions into sounds. One place, priority-ordered, so the
// audio layer never needs hooks scattered through the UI.

import type { HeatsinkView } from '../shared/heatsink/types.ts'
import { playSfx } from './sound.svelte.ts'

function etchedCount(v: HeatsinkView): number {
  return v.players.reduce((s, p) => s + p.grid.filter((c) => c === null).length, 0)
}

function faceUpCount(v: HeatsinkView): number {
  return v.players.reduce((s, p) => s + p.grid.filter((c) => c !== null && c.up).length, 0)
}

export function soundDiff(prev: HeatsinkView | null, next: HeatsinkView, seat: number): void {
  if (prev === null) return

  // New deal (game start, next round, rematch).
  if (next.round !== prev.round || (prev.phase !== 'flip' && next.phase === 'flip')) {
    playSfx('deal')
    return
  }

  // Round settled: chime, with the burn first when the closer got doubled,
  // and the fanfare when WE take the game.
  if ((next.phase === 'roundEnd' || next.phase === 'gameOver') && prev.phase === 'play') {
    if (next.closerDoubled) playSfx('double')
    if (next.phase === 'gameOver' && next.winners?.includes(seat)) {
      playSfx('win', next.closerDoubled ? 500 : 100)
    } else {
      playSfx('chime', next.closerDoubled ? 500 : 0)
    }
    return
  }

  // In-round events, most-specific first.
  if (etchedCount(next) > etchedCount(prev)) {
    playSfx('etch')
  } else if (next.held !== null && prev.held === null) {
    playSfx('flip') // drew from the stack
  } else if (next.discardCount > prev.discardCount) {
    playSfx('place')
  } else if (faceUpCount(next) > faceUpCount(prev)) {
    playSfx('flip')
  }

  // Gentle nudge when the turn becomes ours (layered after the move sound).
  if (next.phase === 'play' && next.turn === seat && prev.turn !== seat) {
    playSfx('turn', 220)
  }
}
