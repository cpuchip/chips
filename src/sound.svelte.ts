// Sound — WebAudio SFX + a looping menu bed, all generated on the local
// asset-harness (Stable Audio 3 one-shots, ACE-Step instrumental bed; seeds
// 701–710 — provenance in docs/ux-notes.md). Settings persist per browser and
// everything respects them: Michael's rule, sounds can always be turned off.

export const audio = $state({
  sfx: loadPref('chips-sfx', true),
  music: loadPref('chips-music', true),
})

function loadPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : v === '1'
  } catch {
    return fallback
  }
}

export function setSfx(on: boolean): void {
  audio.sfx = on
  try {
    localStorage.setItem('chips-sfx', on ? '1' : '0')
  } catch {
    /* private browsing */
  }
  if (on) unlock()
}

export function setMusic(on: boolean): void {
  audio.music = on
  try {
    localStorage.setItem('chips-music', on ? '1' : '0')
  } catch {
    /* private browsing */
  }
  syncMusic()
}

// ── SFX (WebAudio: low latency, overlapping plays) ──────────────────────────

type SfxName =
  | 'deal'
  | 'flip'
  | 'place'
  | 'click'
  | 'turn'
  | 'etch'
  | 'double'
  | 'chime'
  | 'win'

const SFX_FILES: Record<SfxName, { file: string; gain: number }> = {
  deal: { file: 'card_deal', gain: 0.5 },
  flip: { file: 'card_flip', gain: 0.45 },
  place: { file: 'card_place', gain: 0.5 },
  click: { file: 'chip_click', gain: 0.35 },
  turn: { file: 'ui_confirm', gain: 0.4 },
  etch: { file: 'cooldown_vent', gain: 0.6 },
  double: { file: 'heat_double', gain: 0.6 },
  chime: { file: 'round_chime', gain: 0.5 },
  win: { file: 'win_fanfare', gain: 0.65 },
}

let ctx: AudioContext | null = null
const buffers = new Map<SfxName, AudioBuffer>()
let loading = false

async function loadAll(): Promise<void> {
  if (loading || ctx === null) return
  loading = true
  await Promise.all(
    (Object.keys(SFX_FILES) as SfxName[]).map(async (name) => {
      try {
        const res = await fetch(`/assets/sfx/${SFX_FILES[name].file}.ogg`)
        const buf = await ctx!.decodeAudioData(await res.arrayBuffer())
        buffers.set(name, buf)
      } catch {
        /* missing/failed audio must never break the game */
      }
    }),
  )
}

export function playSfx(name: SfxName, delayMs = 0): void {
  if (!audio.sfx || ctx === null || ctx.state !== 'running') return
  const buf = buffers.get(name)
  if (!buf) return
  const src = ctx.createBufferSource()
  src.buffer = buf
  const gain = ctx.createGain()
  gain.gain.value = SFX_FILES[name].gain
  src.connect(gain).connect(ctx.destination)
  src.start(ctx.currentTime + delayMs / 1000)
}

// ── Music (menu bed: home + lobby only, never over the game) ────────────────

let music: HTMLAudioElement | null = null
let musicWanted = false // is the current screen a music screen?

export function setMusicScreen(on: boolean): void {
  musicWanted = on
  syncMusic()
}

function syncMusic(): void {
  if (musicWanted && audio.music && unlocked) {
    if (music === null) {
      music = new Audio('/assets/sfx/chips_menu_lofi.ogg')
      music.loop = true
      music.volume = 0.3
    }
    music.play().catch(() => {
      /* pre-gesture autoplay rejection — unlock() retries */
    })
  } else {
    music?.pause()
  }
}

// ── Autoplay unlock: first user gesture wakes everything ────────────────────

let unlocked = false

export function unlock(): void {
  if (ctx === null) {
    try {
      ctx = new AudioContext()
    } catch {
      return
    }
    void loadAll()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  unlocked = true
  syncMusic()
}

export function initSound(): void {
  const once = () => {
    unlock()
    window.removeEventListener('pointerdown', once)
    window.removeEventListener('keydown', once)
  }
  window.addEventListener('pointerdown', once)
  window.addEventListener('keydown', once)
}
