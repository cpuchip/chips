// Over-the-wire oracle — spawns the REAL server entry (tsx server/index.ts)
// and plays it through websockets like a browser would. Run: npm run wstest.
//
// Covers: hello/welcome, table create/join by code, private tables hidden from
// the public list, bots, a full round of Heatsink over the wire (with the
// REDACTION assertion on every single state message — face-down values must
// never appear), disconnect → autopilot, and rejoin-by-key.

import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import type { ClientMsg, ServerMsg, TableInfo, TableSummary } from '../shared/netproto.ts'
import type { HeatsinkView } from '../shared/heatsink/types.ts'

const PORT = 18642
const BASE = `http://localhost:${PORT}`

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

/** Redaction: no face-down value may ever cross the wire. */
function assertRedacted(v: HeatsinkView, where: string): void {
  for (const p of v.players) {
    for (const c of p.grid) {
      if (c !== null && !c.up && c.v !== null) {
        failed++
        console.error(`FAIL  REDACTION LEAK at ${where}`)
        return
      }
    }
  }
}

class TestClient {
  ws: WebSocket
  queue: ServerMsg[] = []
  waiters: Array<() => void> = []
  state: HeatsinkView | null = null
  table: TableInfo | null = null
  tables: TableSummary[] = []
  errs: string[] = []
  name: string
  private opened: Promise<void>

  constructor(public key: string, name: string) {
    this.name = name
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`)
    // Attach ALL listeners synchronously with construction — an await between
    // construction and listener setup loses events that already fired.
    this.opened = new Promise<void>((res, rej) => {
      this.ws.once('open', () => res())
      this.ws.once('error', rej)
    })
    this.ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw)) as ServerMsg
      if (msg.t === 'state') {
        assertRedacted(msg.view, `${this.name} state msg`)
        this.state = msg.view
      }
      if (msg.t === 'table') this.table = msg.table
      if (msg.t === 'tables') this.tables = msg.tables
      if (msg.t === 'err') this.errs.push(msg.msg)
      this.queue.push(msg)
      for (const w of this.waiters.splice(0)) w()
    })
  }

  async open(): Promise<void> {
    await this.opened
    this.send({ t: 'hello', key: this.key, name: this.name })
    await this.waitFor((m) => m.t === 'welcome', 'welcome')
  }

  send(msg: ClientMsg): void {
    this.ws.send(JSON.stringify(msg))
  }

  /** Wait until any received message matches (scans backlog first). */
  async waitFor(pred: (m: ServerMsg) => boolean, what: string, ms = 8000): Promise<ServerMsg> {
    const scan = () => this.queue.find(pred)
    const start = Date.now()
    for (;;) {
      const hit = scan()
      if (hit) return hit
      if (Date.now() - start > ms) throw new Error(`timeout waiting for ${what} (${this.name})`)
      await new Promise<void>((res) => {
        const t = setTimeout(res, 100)
        this.waiters.push(() => {
          clearTimeout(t)
          res()
        })
      })
    }
  }

  /** Wait until the tracked view satisfies a predicate. */
  async waitState(pred: (v: HeatsinkView) => boolean, what: string, ms = 8000): Promise<HeatsinkView> {
    const start = Date.now()
    for (;;) {
      if (this.state && pred(this.state)) return this.state
      if (Date.now() - start > ms) throw new Error(`timeout waiting for state: ${what} (${this.name})`)
      await new Promise<void>((res) => {
        const t = setTimeout(res, 100)
        this.waiters.push(() => {
          clearTimeout(t)
          res()
        })
      })
    }
  }

  close(): void {
    this.ws.close()
  }
}

/** Drive one legal move for `seat` given the current view. */
function moveFor(v: HeatsinkView, seat: number): ClientMsg {
  const grid = v.players[seat].grid
  if (v.held !== null) {
    const down = grid.findIndex((c) => c !== null && !c.up)
    if (down >= 0) return { t: 'action', a: { t: 'discardHeld', cell: down } }
    const any = grid.findIndex((c) => c !== null)
    return { t: 'action', a: { t: 'placeHeld', cell: any } }
  }
  return { t: 'action', a: { t: 'drawDeck' } }
}

async function main(): Promise<void> {
  const stateDir = mkdtempSync(join(tmpdir(), 'chips-wstest-'))
  // stderr must be 'pipe', not 'inherit': an inherited fd ties our stdout/err
  // pipeline to the child's lifetime — an orphaned server then holds the pipe
  // open and the calling shell never sees EOF.
  const server = spawn('npx', ['tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(PORT), STATE_DIR: stateDir, BOT_DELAY_MS: '5', AUTOPILOT_MS: '60' },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })
  server.stderr.on('data', (d: Buffer) => process.stderr.write(d))
  await new Promise<void>((res, rej) => {
    const to = setTimeout(() => rej(new Error('server did not boot')), 20000)
    server.stdout.on('data', (d: Buffer) => {
      if (String(d).includes('chips server on')) {
        clearTimeout(to)
        res()
      }
    })
    server.on('exit', () => rej(new Error('server exited early')))
  })

  try {
    // HTTP surface
    const health = await (await fetch(`${BASE}/healthz`)).text()
    ok(health === 'ok', '/healthz')
    const version = await (await fetch(`${BASE}/version`)).text()
    ok(version.length > 0, `/version (${version})`)

    // Connect two humans
    const alice = new TestClient('key-alice', 'Alice')
    const bob = new TestClient('key-bob', 'Bob')
    await alice.open()
    await bob.open()
    ok(true, 'hello/welcome for two clients')

    // Alice creates a PRIVATE table
    alice.send({ t: 'createTable', game: 'heatsink', name: 'family table', isPrivate: true })
    await alice.waitFor((m) => m.t === 'table' && m.table !== null, 'table created')
    const code = alice.table!.code
    ok(/^[A-Z]{4}$/.test(code), `4-letter join code (${code})`)
    ok(alice.table!.yourSeat === 0 && alice.table!.hostSeat === 0, 'creator seated as host')

    // Private tables stay off the public list
    bob.send({ t: 'listTables' })
    await bob.waitFor((m) => m.t === 'tables', 'table list')
    ok(!bob.tables.some((t) => t.code === code), 'private table hidden from the lobby')

    // Bob joins by code; Alice adds a bot; game starts
    bob.send({ t: 'joinTable', code })
    await bob.waitFor((m) => m.t === 'table' && m.table?.code === code, 'bob joined')
    ok(bob.table!.yourSeat === 1, 'bob got seat 1')
    alice.send({ t: 'addBot' })
    await alice.waitFor((m) => m.t === 'table' && (m.table?.seats.length ?? 0) === 3, 'bot seated')
    ok(alice.table!.seats[2].isBot, 'third seat is a bot')

    // Non-host cannot start
    bob.send({ t: 'startGame' })
    await bob.waitFor((m) => m.t === 'err', 'start rejected')
    ok(bob.errs.some((e) => e.includes('host')), 'only the host starts')

    alice.send({ t: 'startGame' })
    const flipView = await alice.waitState((v) => v.phase === 'flip', 'flip phase')
    ok(flipView.players.length === 3, 'game started with 3 players')

    // Flip phase: humans flip cells 0 and 1; the bot flips on its own.
    alice.send({ t: 'action', a: { t: 'flip', cell: 0 } })
    alice.send({ t: 'action', a: { t: 'flip', cell: 1 } })
    bob.send({ t: 'action', a: { t: 'flip', cell: 0 } })
    bob.send({ t: 'action', a: { t: 'flip', cell: 1 } })
    const playView = await alice.waitState((v) => v.phase === 'play', 'play phase')
    ok(playView.turn >= 0 && playView.turn < 3, 'a leader was chosen')

    // Illegal actions are rejected without crashing anything. A flip during
    // the play phase is illegal for EVERY seat on EVERY turn — deterministic,
    // unlike "out of turn," which a fast bot can invalidate mid-flight.
    const errsBefore = bob.errs.length
    bob.send({ t: 'action', a: { t: 'flip', cell: 0 } })
    const t0 = Date.now()
    while (bob.errs.length <= errsBefore && Date.now() - t0 < 8000) {
      await new Promise((r) => setTimeout(r, 50))
    }
    ok(bob.errs.length > errsBefore, 'illegal action → err, no crash')

    // Drive the round to completion over the wire.
    let guard = 600
    let v = alice.state!
    while (v.phase === 'play' && guard-- > 0) {
      const seatMsgTarget = v.turn === 0 ? alice : v.turn === 1 ? bob : null
      if (seatMsgTarget !== null) {
        const before = JSON.stringify(v)
        seatMsgTarget.send(moveFor(v, v.turn))
        v = await alice.waitState((nv) => JSON.stringify(nv) !== before, 'state advanced')
      } else {
        const before = JSON.stringify(v)
        v = await alice.waitState((nv) => JSON.stringify(nv) !== before, 'bot moved')
      }
    }
    ok(guard > 0, 'round completed over the wire')
    ok(v.phase === 'roundEnd' || v.phase === 'gameOver', `reached ${v.phase}`)
    ok(v.roundScores !== null && v.roundScores.length === 3, 'round scores delivered')
    ok(v.totals.length === 3, 'totals delivered')

    if (v.phase === 'roundEnd') {
      alice.send({ t: 'nextRound' })
      const v2 = await alice.waitState((nv) => nv.phase === 'flip' && nv.round === v.round + 1, 'next round dealt')
      ok(v2.round === v.round + 1, 'humans can advance the round')
    }

    alice.send({ t: 'leaveTable' })
    bob.send({ t: 'leaveTable' })

    // ── Rejoin + autopilot: Carol + bot, disconnect mid-flip, reconnect ──────
    const carol = new TestClient('key-carol', 'Carol')
    await carol.open()
    carol.send({ t: 'createTable', game: 'heatsink', name: 'solo run', isPrivate: false })
    await carol.waitFor((m) => m.t === 'table' && m.table !== null, 'carol table')
    const code2 = carol.table!.code
    carol.send({ t: 'addBot' })
    await carol.waitFor((m) => m.t === 'table' && (m.table?.seats.length ?? 0) === 2, 'carol bot')
    carol.send({ t: 'startGame' })
    await carol.waitState((nv) => nv.phase === 'flip', 'carol game started')

    // Public list shows it now (wait for the tables push that follows welcome)
    const dave = new TestClient('key-dave', 'Dave')
    await dave.open()
    await dave.waitFor((m) => m.t === 'tables' && m.tables.some((t) => t.code === code2), 'public table listed')
    ok(dave.tables.some((t) => t.code === code2), 'public table listed in the lobby')

    // Carol vanishes mid-flip: autopilot (60ms in this test) flips for her.
    carol.close()
    await new Promise((r) => setTimeout(r, 400))

    // Carol comes back: auto-reattached to her seat with live state.
    const carol2 = new TestClient('key-carol', 'Carol')
    await carol2.open()
    await carol2.waitFor((m) => m.t === 'table' && m.table?.code === code2, 'rejoin reattached')
    ok(carol2.table!.yourSeat === 0, 'rejoined the same seat')
    const rv = await carol2.waitState(() => true, 'state after rejoin')
    ok(rv.players[0].initialFlipsDone > 0 || rv.phase === 'play', 'autopilot moved while away')

    alice.close()
    bob.close()
    carol2.close()
    dave.close()
  } finally {
    // Windows: kill() only reaches the cmd.exe shell wrapper — taskkill /T
    // takes the real node process down with it (orphans hold the port and
    // poison the next run). AWAIT it: process.exit() right after a
    // fire-and-forget spawn can beat taskkill to the punch.
    if (process.platform === 'win32' && server.pid) {
      await new Promise<void>((res) => {
        const k = spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { shell: true })
        k.on('exit', () => res())
        k.on('error', () => res())
        setTimeout(res, 3000)
      })
    } else {
      server.kill()
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
