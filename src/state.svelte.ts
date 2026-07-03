// Client state — one reactive object the whole UI reads. net.ts writes it.

import type { HeatsinkView } from '../shared/heatsink/types.ts'
import type { TableInfo, TableSummary } from '../shared/netproto.ts'

export interface Toast {
  id: number
  msg: string
}

export interface ChatLine {
  from: string
  text: string
}

function loadName(): string {
  try {
    return localStorage.getItem('chips-name') ?? ''
  } catch {
    return ''
  }
}

export const app = $state({
  connected: false,
  version: 'dev',
  name: loadName(),
  tables: [] as TableSummary[],
  table: null as TableInfo | null,
  view: null as HeatsinkView | null,
  seat: -1,
  toasts: [] as Toast[],
  chat: [] as ChatLine[],
  lastError: '',
})

let toastId = 0

export function pushToast(msg: string): void {
  const id = ++toastId
  app.toasts.push({ id, msg })
  setTimeout(() => {
    const i = app.toasts.findIndex((t) => t.id === id)
    if (i >= 0) app.toasts.splice(i, 1)
  }, 4000)
}

export function saveName(name: string): void {
  app.name = name
  try {
    localStorage.setItem('chips-name', name)
  } catch {
    /* private browsing — fine */
  }
}
