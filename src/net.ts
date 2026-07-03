// WebSocket client — same-origin /ws (Vite proxies it in dev). Reconnects
// with backoff; the server auto-reattaches our seat by player key.

import { nanoid } from 'nanoid'
import type { ClientMsg, ServerMsg } from '../shared/netproto.ts'
import { app, pushToast } from './state.svelte.ts'
import { soundDiff } from './soundDiff.ts'

function playerKey(): string {
  try {
    let k = localStorage.getItem('chips-key')
    if (!k) {
      k = nanoid()
      localStorage.setItem('chips-key', k)
    }
    return k
  } catch {
    return nanoid() // private browsing: fresh key per session
  }
}

const KEY = playerKey()
let ws: WebSocket | null = null
let backoff = 500

export function connect(): void {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  ws = new WebSocket(`${proto}//${location.host}/ws`)

  ws.onopen = () => {
    backoff = 500
    app.connected = true
    send({ t: 'hello', key: KEY, name: app.name || 'player' })
  }

  ws.onmessage = (ev) => {
    let msg: ServerMsg
    try {
      msg = JSON.parse(ev.data)
    } catch {
      return
    }
    switch (msg.t) {
      case 'welcome':
        app.version = msg.version
        if (!app.name) app.name = msg.name
        return
      case 'tables':
        app.tables = msg.tables
        return
      case 'table':
        app.table = msg.table
        if (msg.table === null) {
          app.view = null
          app.seat = -1
          app.chat = []
        } else {
          app.seat = msg.table.yourSeat
        }
        return
      case 'state':
        soundDiff(app.view, msg.view, msg.seat)
        app.view = msg.view
        app.seat = msg.seat
        return
      case 'toast':
        pushToast(msg.msg)
        return
      case 'chat':
        app.chat.push({ from: msg.from, text: msg.text })
        if (app.chat.length > 100) app.chat.splice(0, app.chat.length - 100)
        return
      case 'err':
        app.lastError = msg.msg
        pushToast(`⚠ ${msg.msg}`)
        return
    }
  }

  ws.onclose = () => {
    app.connected = false
    setTimeout(connect, backoff)
    backoff = Math.min(backoff * 2, 8000)
  }
}

export function send(msg: ClientMsg): void {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}
