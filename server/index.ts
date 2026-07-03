// chips server — serves the built client (dist/), the same-origin table
// WebSocket at /ws, /healthz, /version (the deploy oracle), and a read-only
// /api for table summaries. One process, authoritative over every table.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, existsSync, mkdirSync, writeFileSync, readFile } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer, WebSocket } from 'ws'
import { view } from '../shared/heatsink/engine.ts'
import type { ClientMsg, ServerMsg } from '../shared/netproto.ts'
import { Registry, Table, type TableEvents } from './tables.ts'

const PORT = Number(process.env.PORT ?? 8080)
const STATE_DIR = process.env.STATE_DIR ?? './data'
const DIST = join(process.cwd(), 'dist')

// ── Version (deploy oracle) ──────────────────────────────────────────────────

function readVersion(): string {
  try {
    return readFileSync(join(DIST, 'version.txt'), 'utf8').trim()
  } catch {
    return process.env.VITE_GIT_SHA?.trim() || 'dev'
  }
}
const VERSION = readVersion()

// ── Clients ──────────────────────────────────────────────────────────────────

interface Client {
  key: string
  name: string
  ws: WebSocket
}

const clientsByKey = new Map<string, Client>()

function send(ws: WebSocket, msg: ServerMsg): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

function sendToKey(key: string, msg: ServerMsg): void {
  const c = clientsByKey.get(key)
  if (c) send(c.ws, msg)
}

function broadcastTables(): void {
  const msg: ServerMsg = { t: 'tables', tables: registry.publicSummaries() }
  for (const c of clientsByKey.values()) send(c.ws, msg)
}

/** Push the table info + game state to everyone seated at the table. */
function pushTable(table: Table): void {
  for (const seat of table.seats) {
    if (seat.key === null) continue
    const client = clientsByKey.get(seat.key)
    if (!client) continue
    send(client.ws, { t: 'table', table: table.info(seat.key) })
    if (table.state !== null) {
      send(client.ws, { t: 'state', view: view(table.state), seat: table.seatOf(seat.key) })
    }
  }
  saveSoon()
}

const events: TableEvents = {
  onUpdate: (table) => pushTable(table),
  onTablesChanged: () => broadcastTables(),
  onToast: (table, msg) => {
    for (const seat of table.seats) {
      if (seat.key !== null) sendToKey(seat.key, { t: 'toast', msg })
    }
  },
}

const registry = new Registry(events)

// ── Persistence (survive redeploys mid-game) ─────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null

function saveSoon(): void {
  if (saveTimer) return
  saveTimer = setTimeout(saveNow, 3000)
}

function saveNow(): void {
  saveTimer = null
  try {
    mkdirSync(STATE_DIR, { recursive: true })
    const data = [...registry.tables.values()].map((t) => ({
      code: t.code,
      name: t.name,
      isPrivate: t.isPrivate,
      hostKey: t.hostKey,
      seats: t.seats,
      state: t.state,
      lastActivity: t.lastActivity,
    }))
    writeFileSync(join(STATE_DIR, 'tables.json'), JSON.stringify(data))
  } catch (e) {
    console.error('[save] failed:', e)
  }
}

function load(): void {
  try {
    const raw = readFileSync(join(STATE_DIR, 'tables.json'), 'utf8')
    const data = JSON.parse(raw) as Array<{
      code: string
      name: string
      isPrivate: boolean
      hostKey: string
      seats: Table['seats']
      state: Table['state']
      lastActivity: number
    }>
    for (const t of data) {
      const table = new Table(t.code, t.name, t.isPrivate, t.hostKey, events)
      table.seats = t.seats.map((s) => ({ ...s, connected: s.isBot })) // humans reconnect
      table.state = t.state
      table.lastActivity = t.lastActivity
      registry.tables.set(t.code, table)
    }
    if (data.length) console.log(`[load] restored ${data.length} table(s)`)
  } catch {
    /* first boot */
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.woff2': 'font/woff2',
}

function handleHttp(req: IncomingMessage, res: ServerResponse): void {
  const url = (req.url ?? '/').split('?')[0]
  if (url === '/healthz') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (url === '/version') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end(VERSION)
    return
  }
  if (url === '/api/tables') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(registry.publicSummaries()))
    return
  }
  // Static from dist/ with SPA fallback.
  const safe = normalize(url).replace(/^([.\\/])+/, '')
  let file = join(DIST, safe === '' ? 'index.html' : safe)
  if (!existsSync(file) || extname(file) === '') file = join(DIST, 'index.html')
  readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found (build the client: npm run build)')
      return
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(buf)
  })
}

// ── WebSocket ────────────────────────────────────────────────────────────────

function cleanName(name: unknown): string {
  const s = String(name ?? '')
    .replace(/[^\P{C}]/gu, '')
    .trim()
    .slice(0, 20)
  return s || 'player'
}

function handleMsg(client: Client, msg: ClientMsg): void {
  switch (msg.t) {
    case 'hello':
      return // handled at connection
    case 'setName': {
      client.name = cleanName(msg.name)
      send(client.ws, { t: 'welcome', name: client.name, version: VERSION })
      return
    }
    case 'listTables': {
      send(client.ws, { t: 'tables', tables: registry.publicSummaries() })
      return
    }
    case 'createTable': {
      leaveCurrent(client)
      const table = registry.create(client.key, client.name, cleanName(msg.name), !!msg.isPrivate)
      pushTable(table)
      return
    }
    case 'joinTable': {
      const table = registry.get(String(msg.code ?? ''))
      if (!table) throw new Error('no such table')
      if (table.seatOf(client.key) >= 0) {
        table.reconnect(client.key)
      } else {
        leaveCurrent(client)
        table.addHuman(client.key, client.name)
      }
      pushTable(table)
      broadcastTables()
      return
    }
    case 'leaveTable': {
      leaveCurrent(client)
      send(client.ws, { t: 'table', table: null })
      broadcastTables()
      return
    }
    case 'addBot': {
      const table = mustBeSeated(client)
      table.addBot(client.key)
      pushTable(table)
      broadcastTables()
      return
    }
    case 'removeBot': {
      const table = mustBeSeated(client)
      table.removeBot(client.key)
      pushTable(table)
      broadcastTables()
      return
    }
    case 'startGame': {
      const table = mustBeSeated(client)
      table.start(client.key)
      return
    }
    case 'action': {
      const table = mustBeSeated(client)
      table.act(client.key, msg.a)
      return
    }
    case 'nextRound': {
      const table = mustBeSeated(client)
      table.advanceRound(client.key)
      return
    }
    case 'rematch': {
      const table = mustBeSeated(client)
      table.rematch(client.key)
      return
    }
    case 'chat': {
      const table = mustBeSeated(client)
      const text = String(msg.text ?? '').trim().slice(0, 200)
      if (!text) return
      for (const seat of table.seats) {
        if (seat.key !== null) sendToKey(seat.key, { t: 'chat', from: client.name, text })
      }
      return
    }
  }
}

function mustBeSeated(client: Client): Table {
  const table = registry.findSeat(client.key)
  if (!table) throw new Error('not at a table')
  return table
}

function leaveCurrent(client: Client): void {
  const table = registry.findSeat(client.key)
  if (table) {
    table.leave(client.key)
    pushTable(table)
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

load()

const httpServer = createServer(handleHttp)
const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', (ws) => {
  let client: Client | null = null

  ws.on('message', (raw) => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    try {
      if (client === null) {
        if (msg.t !== 'hello') return
        const key = String(msg.key ?? '').slice(0, 40)
        if (!key) return
        // One live socket per key — a new tab supersedes the old one.
        const prev = clientsByKey.get(key)
        if (prev && prev.ws !== ws) prev.ws.close()
        client = { key, name: cleanName(msg.name), ws }
        clientsByKey.set(key, client)
        send(ws, { t: 'welcome', name: client.name, version: VERSION })
        send(ws, { t: 'tables', tables: registry.publicSummaries() })
        // Auto-reattach if this key is seated somewhere (mid-game rejoin).
        const seatTable = registry.findSeat(key)
        if (seatTable) {
          seatTable.reconnect(key)
          pushTable(seatTable)
        }
        return
      }
      handleMsg(client, msg)
    } catch (e) {
      send(ws, { t: 'err', msg: e instanceof Error ? e.message : String(e) })
    }
  })

  ws.on('close', () => {
    if (client === null) return
    if (clientsByKey.get(client.key)?.ws === ws) clientsByKey.delete(client.key)
    const table = registry.findSeat(client.key)
    if (table) {
      table.markDisconnected(client.key)
      pushTable(table)
      broadcastTables()
    }
  })
})

setInterval(() => {
  registry.sweep()
  saveSoon()
}, 30_000)

httpServer.listen(PORT, () => {
  console.log(`chips server on :${PORT} (version ${VERSION})`)
})
