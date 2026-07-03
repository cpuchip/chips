// Wire protocol — chips lobby + table messages. Shared by server and client so
// they can never disagree about shapes. Game-specific payloads reference the
// game's own types (Heatsink is game #1; the envelope is game-agnostic).

import type { Action, HeatsinkView } from './heatsink/types.ts'

export type GameId = 'heatsink' // | 'cooldown' | 'overclock' — someday

export interface SeatInfo {
  name: string
  isBot: boolean
  connected: boolean
}

export type TableStatus = 'lobby' | 'playing'

export interface TableSummary {
  code: string
  name: string
  game: GameId
  seats: number
  capacity: number
  status: TableStatus
}

export interface TableInfo {
  code: string
  name: string
  game: GameId
  isPrivate: boolean
  status: TableStatus
  seats: SeatInfo[]
  hostSeat: number
  yourSeat: number
}

// ── Client → Server ──────────────────────────────────────────────────────────

export type ClientMsg =
  | { t: 'hello'; key: string; name: string }
  | { t: 'setName'; name: string }
  | { t: 'listTables' }
  | { t: 'createTable'; game: GameId; name: string; isPrivate: boolean }
  | { t: 'joinTable'; code: string }
  | { t: 'leaveTable' }
  | { t: 'addBot' }
  | { t: 'removeBot' }
  | { t: 'startGame' }
  | { t: 'action'; a: Action }
  | { t: 'nextRound' }
  | { t: 'rematch' }
  | { t: 'chat'; text: string }

// ── Server → Client ──────────────────────────────────────────────────────────

export type ServerMsg =
  | { t: 'welcome'; name: string; version: string }
  | { t: 'tables'; tables: TableSummary[] }
  | { t: 'table'; table: TableInfo | null }
  | { t: 'state'; view: HeatsinkView; seat: number }
  | { t: 'toast'; msg: string }
  | { t: 'chat'; from: string; text: string }
  | { t: 'err'; msg: string }
