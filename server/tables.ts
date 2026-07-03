// Table registry — the server's authoritative world. Each Table owns one
// Heatsink engine instance; humans and bots sit in seats; face-down values
// never leave this process (clients get view() only).

import { mulberry32, type Rng } from '../shared/rng.ts'
import { apply, newGame, nextRound, view } from '../shared/heatsink/engine.ts'
import { botAction } from '../shared/heatsink/bot.ts'
import type { HeatsinkState, Action } from '../shared/heatsink/types.ts'
import type { GameId, SeatInfo, TableInfo, TableStatus, TableSummary } from '../shared/netproto.ts'

export const MAX_SEATS = 8
export const MIN_SEATS_TO_START = 2

/** Bot turn pacing (ms) — overridable so wstest runs fast. */
export const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS ?? 700)
/** A disconnected human's turn is auto-played after this long. */
export const AUTOPILOT_MS = Number(process.env.AUTOPILOT_MS ?? 45_000)

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ' // no I/O — read-aloud friendly
const BOT_NAMES = ['Resistor', 'Capacitor', 'Inductor', 'Diode', 'Mosfet', 'Crystal', 'Relay', 'Varistor']

export interface Seat {
  key: string | null // player key; null for bots
  name: string
  isBot: boolean
  connected: boolean
}

export interface TableEvents {
  /** State/table/lobby changed — push fresh views to everyone at the table. */
  onUpdate(table: Table): void
  /** Public table list changed — refresh lobby browsers. */
  onTablesChanged(): void
  onToast(table: Table, msg: string): void
}

export class Table {
  code: string
  name: string
  game: GameId = 'heatsink'
  isPrivate: boolean
  seats: Seat[] = []
  hostKey: string
  state: HeatsinkState | null = null
  rng: Rng
  lastActivity = Date.now()
  private botTimer: ReturnType<typeof setTimeout> | null = null
  private autopilotTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    code: string,
    name: string,
    isPrivate: boolean,
    hostKey: string,
    private events: TableEvents,
    seed?: number,
  ) {
    this.code = code
    this.name = name
    this.isPrivate = isPrivate
    this.hostKey = hostKey
    this.rng = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 31))
  }

  get status(): TableStatus {
    return this.state === null ? 'lobby' : 'playing'
  }

  get connectedHumans(): number {
    return this.seats.filter((s) => !s.isBot && s.connected).length
  }

  touch(): void {
    this.lastActivity = Date.now()
  }

  summary(): TableSummary {
    return {
      code: this.code,
      name: this.name,
      game: this.game,
      seats: this.seats.length,
      capacity: MAX_SEATS,
      status: this.status,
    }
  }

  info(forKey: string): TableInfo {
    const seats: SeatInfo[] = this.seats.map((s) => ({ name: s.name, isBot: s.isBot, connected: s.connected }))
    return {
      code: this.code,
      name: this.name,
      game: this.game,
      isPrivate: this.isPrivate,
      status: this.status,
      seats,
      hostSeat: this.seats.findIndex((s) => s.key === this.hostKey),
      yourSeat: this.seatOf(forKey),
    }
  }

  seatOf(key: string): number {
    return this.seats.findIndex((s) => s.key === key)
  }

  addHuman(key: string, name: string): void {
    if (this.seatOf(key) >= 0) return // already seated
    if (this.state !== null) throw new Error('table already playing')
    if (this.seats.length >= MAX_SEATS) throw new Error('table full')
    this.seats.push({ key, name, isBot: false, connected: true })
    this.touch()
  }

  addBot(byKey: string): void {
    if (byKey !== this.hostKey) throw new Error('only the host seats bots')
    if (this.state !== null) throw new Error('table already playing')
    if (this.seats.length >= MAX_SEATS) throw new Error('table full')
    const used = new Set(this.seats.map((s) => s.name))
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.seats.length + 1}`
    this.seats.push({ key: null, name, isBot: true, connected: true })
    this.touch()
  }

  removeBot(byKey: string): void {
    if (byKey !== this.hostKey) throw new Error('only the host seats bots')
    if (this.state !== null) throw new Error('table already playing')
    const i = this.seats.map((s) => s.isBot).lastIndexOf(true)
    if (i >= 0) this.seats.splice(i, 1)
    this.touch()
  }

  /** Socket dropped (refresh, tab close): keep the seat, mark disconnected. */
  markDisconnected(key: string): void {
    const i = this.seatOf(key)
    if (i < 0) return
    this.seats[i].connected = false
    this.scheduleAutopilot()
    this.touch()
  }

  /** Explicit leave: give up the seat (lobby) or go disconnected (mid-game). */
  leave(key: string): void {
    const i = this.seatOf(key)
    if (i < 0) return
    if (this.state === null) {
      this.seats.splice(i, 1)
      // Host migration in the lobby.
      if (key === this.hostKey) {
        const nextHost = this.seats.find((s) => !s.isBot)
        this.hostKey = nextHost?.key ?? ''
      }
    } else {
      // Mid-game the seat survives (rejoinable); autopilot covers their turns.
      this.seats[i].connected = false
      this.scheduleAutopilot()
    }
    this.touch()
  }

  reconnect(key: string): boolean {
    const i = this.seatOf(key)
    if (i < 0) return false
    this.seats[i].connected = true
    this.scheduleAutopilot() // re-derive: clears a stale timer, covers whoever is actually blocked
    this.touch()
    return true
  }

  start(byKey: string): void {
    if (byKey !== this.hostKey) throw new Error('only the host starts the game')
    if (this.state !== null) throw new Error('already started')
    if (this.seats.length < MIN_SEATS_TO_START) throw new Error('need at least 2 seats (add a bot?)')
    if (!this.seats.some((s) => !s.isBot)) throw new Error('need a human at the table')
    this.state = newGame(this.seats.length, this.rng)
    this.touch()
    this.afterChange()
  }

  act(key: string, action: Action): void {
    const seat = this.seatOf(key)
    if (seat < 0) throw new Error('not seated here')
    if (this.state === null) throw new Error('game not started')
    this.applyAction(seat, action)
  }

  advanceRound(key: string): void {
    if (this.seatOf(key) < 0 || this.seats[this.seatOf(key)].isBot) throw new Error('not seated here')
    if (this.state?.phase !== 'roundEnd') throw new Error('round not over')
    nextRound(this.state, this.rng)
    this.touch()
    this.afterChange()
  }

  rematch(key: string): void {
    if (this.seatOf(key) < 0) throw new Error('not seated here')
    if (this.state?.phase !== 'gameOver') throw new Error('game not over')
    this.state = newGame(this.seats.length, this.rng)
    this.touch()
    this.afterChange()
  }

  /** Apply an action for a seat (human or bot), then run consequences. */
  private applyAction(seat: number, action: Action): void {
    if (this.state === null) throw new Error('game not started')
    const before = this.state
    const etchedBefore = countEtched(before, seat)
    const closerBefore = before.closer
    apply(this.state, seat, action, this.rng)
    this.touch()

    const etchedAfter = countEtched(this.state, seat)
    if (etchedAfter > etchedBefore) {
      this.events.onToast(this, `${this.seats[seat].name} etched a column! ⚡`)
    }
    if (closerBefore === null && this.state.closer !== null) {
      this.events.onToast(this, `${this.seats[this.state.closer].name} is fully revealed — last turns!`)
    }
    if (this.state.phase === 'roundEnd' || this.state.phase === 'gameOver') {
      if (this.state.closerDoubled && this.state.closer !== null) {
        this.events.onToast(this, `${this.seats[this.state.closer].name} wasn't lowest — heat DOUBLED 🔥`)
      }
    }
    this.afterChange()
  }

  /** Push updates and keep bot/autopilot turns moving. */
  private afterChange(): void {
    this.events.onUpdate(this)
    this.events.onTablesChanged()
    this.scheduleBots()
    this.scheduleAutopilot()
  }

  /** If it's a bot's move (turn, or pending flips in the flip phase), act soon. */
  private scheduleBots(): void {
    if (this.botTimer !== null || this.state === null) return
    const next = this.nextBotMove()
    if (next === null) return
    this.botTimer = setTimeout(() => {
      this.botTimer = null
      const s = this.state
      if (s === null) return
      const mv = this.nextBotMove()
      if (mv === null) return
      try {
        this.applyAction(mv, botAction(view(s), mv, this.rng))
      } catch (e) {
        // A bot playing an illegal move is an engine/bot bug — log loudly.
        console.error(`[table ${this.code}] bot error:`, e)
      }
    }, BOT_DELAY_MS)
  }

  /** Which bot seat should move now? (flip phase: any bot with flips left) */
  private nextBotMove(): number | null {
    const s = this.state
    if (s === null) return null
    if (s.phase === 'flip') {
      for (let i = 0; i < this.seats.length; i++) {
        if (this.seats[i].isBot && s.players[i].initialFlips.length < 2) return i
      }
      return null
    }
    if (s.phase === 'play' && this.seats[s.turn]?.isBot) return s.turn
    // Bots don't advance rounds — a human clicks Next Round.
    return null
  }

  /** Whose move is blocked on a disconnected human right now? */
  private blockedSeat(): number | null {
    const s = this.state
    if (s === null) return null
    if (s.phase === 'flip') {
      for (let i = 0; i < this.seats.length; i++) {
        const seat = this.seats[i]
        if (!seat.isBot && !seat.connected && s.players[i].initialFlips.length < 2) return i
      }
      return null
    }
    if (s.phase === 'play') {
      const seat = this.seats[s.turn]
      if (seat && !seat.isBot && !seat.connected) return s.turn
    }
    return null
  }

  /** A disconnected human's move gets auto-played after AUTOPILOT_MS. */
  private scheduleAutopilot(): void {
    if (this.autopilotTimer !== null) {
      clearTimeout(this.autopilotTimer)
      this.autopilotTimer = null
    }
    if (this.blockedSeat() === null) return
    this.autopilotTimer = setTimeout(() => {
      this.autopilotTimer = null
      const st = this.state
      const seat = this.blockedSeat()
      if (st === null || seat === null) return
      try {
        this.applyAction(seat, botAction(view(st), seat, this.rng))
        this.events.onToast(this, `${this.seats[seat].name} is away — autopilot moved for them`)
      } catch (e) {
        console.error(`[table ${this.code}] autopilot error:`, e)
      }
    }, AUTOPILOT_MS)
  }


  dispose(): void {
    if (this.botTimer) clearTimeout(this.botTimer)
    if (this.autopilotTimer) clearTimeout(this.autopilotTimer)
  }
}

function countEtched(state: HeatsinkState, seat: number): number {
  return state.players[seat].grid.filter((c) => c === null).length
}

// ── Registry ─────────────────────────────────────────────────────────────────

export class Registry {
  tables = new Map<string, Table>()

  constructor(private events: TableEvents) {}

  create(hostKey: string, hostName: string, name: string, isPrivate: boolean): Table {
    let code = this.newCode()
    const table = new Table(code, name || `${hostName}'s table`, isPrivate, hostKey, this.events)
    table.addHuman(hostKey, hostName)
    this.tables.set(code, table)
    this.events.onTablesChanged()
    return table
  }

  private newCode(): string {
    for (;;) {
      let code = ''
      for (let i = 0; i < 4; i++) code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      if (!this.tables.has(code)) return code
    }
  }

  get(code: string): Table | undefined {
    return this.tables.get(code.toUpperCase())
  }

  /** The table a player is currently seated at, if any. */
  findSeat(key: string): Table | undefined {
    for (const t of this.tables.values()) if (t.seatOf(key) >= 0) return t
    return undefined
  }

  publicSummaries(): TableSummary[] {
    return [...this.tables.values()]
      .filter((t) => !t.isPrivate)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map((t) => t.summary())
  }

  /** Drop dead tables: nobody connected for a while, or lobby gone stale. */
  sweep(now = Date.now()): void {
    for (const [code, t] of this.tables) {
      const idleMs = now - t.lastActivity
      const dead =
        (t.connectedHumans === 0 && idleMs > 10 * 60_000) ||
        (t.state === null && t.connectedHumans === 0 && idleMs > 2 * 60_000)
      if (dead) {
        t.dispose()
        this.tables.delete(code)
        this.events.onTablesChanged()
      }
    }
  }
}
