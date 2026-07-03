<script lang="ts">
  import { app } from './state.svelte.ts'
  import { send } from './net.ts'
  import HeatCard from './HeatCard.svelte'
  import { heatClass } from './heat.ts'
  import type { PlayerView } from '../shared/heatsink/types.ts'

  const v = $derived(app.view)
  const me = $derived(app.seat)
  const table = $derived(app.table!)

  type Mode = 'idle' | 'discardSwap' | 'flipChoose'
  let mode = $state<Mode>('idle')
  let chatOpen = $state(false)
  let chatText = $state('')

  const myTurn = $derived(v !== null && v.phase === 'play' && v.turn === me)
  const inFlip = $derived(v !== null && v.phase === 'flip')
  const myFlipsLeft = $derived(v === null || me < 0 ? 0 : 2 - v.players[me].initialFlipsDone)
  const myGrid = $derived(v === null || me < 0 ? [] : v.players[me].grid)
  const hasFaceDown = $derived(myGrid.some((c) => c !== null && !c.up))

  // Reset selection whenever the turn moves away from us.
  $effect(() => {
    if (!myTurn && !inFlip) mode = 'idle'
  })

  function sum(p: PlayerView): number {
    return p.grid.reduce((s, c) => s + (c !== null && c.up && c.v !== null ? c.v : 0), 0)
  }

  function seatName(i: number): string {
    return table.seats[i]?.name ?? `player ${i + 1}`
  }

  function cellTarget(i: number): boolean {
    const c = myGrid[i]
    if (c === null) return false
    if (inFlip) return myFlipsLeft > 0 && !c.up
    if (!myTurn) return false
    if (mode === 'discardSwap') return true
    if (mode === 'flipChoose') return !c.up
    if (v!.held !== null) return true // placing the held card
    return false
  }

  function clickMyCell(i: number): void {
    if (!cellTarget(i)) return
    if (inFlip) {
      send({ t: 'action', a: { t: 'flip', cell: i } })
      return
    }
    if (mode === 'discardSwap') {
      send({ t: 'action', a: { t: 'takeDiscard', cell: i } })
    } else if (mode === 'flipChoose') {
      send({ t: 'action', a: { t: 'discardHeld', cell: i } })
    } else if (v!.held !== null) {
      send({ t: 'action', a: { t: 'placeHeld', cell: i } })
    }
    mode = 'idle'
  }

  function clickDraw(): void {
    if (myTurn && v!.held === null && mode === 'idle') send({ t: 'action', a: { t: 'drawDeck' } })
  }

  function clickDiscard(): void {
    if (!myTurn) return
    if (v!.held === null && mode === 'idle' && v!.discardTop !== null) {
      mode = 'discardSwap'
    } else if (v!.held !== null && hasFaceDown) {
      mode = 'flipChoose'
    } else if (mode !== 'idle') {
      mode = 'idle'
    }
  }

  const banner = $derived.by(() => {
    if (v === null) return ''
    if (v.phase === 'flip') {
      return myFlipsLeft > 0 ? `flip ${myFlipsLeft === 2 ? 'two cards' : 'one more card'} to power on` : 'waiting for the other players…'
    }
    if (v.phase !== 'play') return ''
    if (!myTurn) return `${seatName(v.turn)} is thinking…`
    if (mode === 'discardSwap') return `swap the ${v.discardTop} into your board — click a card`
    if (mode === 'flipChoose') return 'click a face-down card to flip it'
    if (v.held !== null) return `you drew a ${v.held} — place it, or tap the discard to toss & flip`
    return 'take the discard, or draw from the stack'
  })

  function sendChat(): void {
    const text = chatText.trim()
    if (text) send({ t: 'chat', text })
    chatText = ''
  }
</script>

{#if v !== null}
  <main class="game">
    <header class="bar">
      <span class="trace-title">heatsink</span>
      <span class="dim">round {v.round}</span>
      {#if v.closer !== null && v.phase === 'play'}
        <span class="closing">⚠ {seatName(v.closer)} is done — last turns!</span>
      {/if}
      <span class="spacer"></span>
      <span class="dim ver">{app.version}</span>
      <button class="slim" onclick={() => send({ t: 'leaveTable' })}>Leave</button>
    </header>

    <section class="opponents" class:few={v.players.length <= 3}>
      {#each v.players as p, i (i)}
        {#if i !== me}
          <div class="opp" class:active={v.phase === 'play' && v.turn === i}>
            <div class="opp-line">
              <span class="oname">{seatName(i)}</span>
              <span class="oheat">{sum(p)}°</span>
              <span class="ototal">Σ{v.totals[i]}</span>
            </div>
            <div class="mini-grid">
              {#each p.grid as c, j (j)}
                {#if c === null}
                  <div class="mini etched"></div>
                {:else if c.up && c.v !== null}
                  <div class={`mini ${heatClass(c.v)}`}>{c.v}</div>
                {:else}
                  <div class="mini down"></div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}
      {/each}
    </section>

    <section class="center">
      <div class="piles">
        <div class="pile">
          <HeatCard clickable={myTurn && v.held === null && mode === 'idle'} target={myTurn && v.held === null && mode === 'idle'} onclick={clickDraw} />
          <span class="dim plabel">stack · {v.drawCount}</span>
        </div>
        <div class="pile">
          {#if v.discardTop !== null}
            <HeatCard
              value={v.discardTop}
              clickable={myTurn && ((v.held === null && mode === 'idle') || (v.held !== null && hasFaceDown))}
              target={myTurn && v.held === null && mode === 'idle'}
              onclick={clickDiscard}
            />
          {:else}
            <HeatCard etched />
          {/if}
          <span class="dim plabel">discard</span>
        </div>
        {#if v.held !== null}
          <div class="pile held">
            <HeatCard value={v.held} />
            <span class="dim plabel">drawn</span>
          </div>
        {/if}
      </div>
      <div class="banner" class:mine-turn={myTurn || (inFlip && myFlipsLeft > 0)}>
        {banner}
        {#if mode !== 'idle'}
          <button class="slim" onclick={() => (mode = 'idle')}>cancel</button>
        {/if}
      </div>
    </section>

    <section class="mine" class:active={myTurn}>
      <div class="mine-line">
        <span class="oname">{me >= 0 ? seatName(me) : ''} (you)</span>
        <span class="oheat">{me >= 0 && v.players[me] ? sum(v.players[me]) : 0}°</span>
        <span class="ototal">Σ{me >= 0 ? v.totals[me] : 0}</span>
      </div>
      <div class="grid4x3 big">
        {#each myGrid as c, i (i)}
          <HeatCard
            value={c === null ? null : c.up ? c.v : null}
            etched={c === null}
            clickable={cellTarget(i)}
            target={cellTarget(i)}
            onclick={() => clickMyCell(i)}
          />
        {/each}
      </div>
    </section>

    <div class="chat" class:open={chatOpen}>
      <button class="chat-toggle" onclick={() => (chatOpen = !chatOpen)}>
        {chatOpen ? '×' : '💬'}
      </button>
      {#if chatOpen}
        <div class="chat-lines">
          {#each app.chat as line, i (i)}
            <div><b>{line.from}:</b> {line.text}</div>
          {/each}
        </div>
        <input
          type="text"
          placeholder="say something…"
          bind:value={chatText}
          onkeydown={(e) => e.key === 'Enter' && sendChat()}
        />
      {/if}
    </div>

    {#if v.phase === 'roundEnd' || v.phase === 'gameOver'}
      <div class="overlay">
        <div class="panel scores">
          <h2>{v.phase === 'gameOver' ? 'game over' : `round ${v.round}`}</h2>
          <table>
            <tbody>
              {#each v.players as _, i (i)}
                <tr class:winner={v.winners?.includes(i)}>
                  <td>{seatName(i)}{i === me ? ' (you)' : ''}</td>
                  <td class="num">
                    {#if v.roundScores}
                      +{v.roundScores[i]}
                      {#if v.closer === i && v.closerDoubled}<span class="doubled">×2 🔥</span>{/if}
                    {/if}
                  </td>
                  <td class="num total-col">{v.totals[i]}</td>
                </tr>
              {/each}
            </tbody>
          </table>
          {#if v.phase === 'gameOver' && v.winners}
            <p class="win-line">🏆 {v.winners.map(seatName).join(' & ')} ran coolest!</p>
            <div class="row">
              <button class="primary" onclick={() => send({ t: 'rematch' })}>Rematch</button>
              <button onclick={() => send({ t: 'leaveTable' })}>Back to lobby</button>
            </div>
          {:else}
            <div class="row">
              <button class="primary" onclick={() => send({ t: 'nextRound' })}>Next round</button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  </main>
{/if}

<style>
  /* ── The one-screen shell: status / info / action / interaction ───────── */
  main.game {
    height: 100dvh;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    overflow: hidden;
    padding: 6px clamp(8px, 2vw, 20px) max(10px, env(safe-area-inset-bottom));
    gap: 4px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
  }

  /* status bar */
  .bar {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 34px;
  }

  .bar .trace-title {
    font-size: 18px;
    font-weight: 600;
  }

  .spacer {
    flex: 1;
  }

  .ver {
    font-size: 11px;
  }

  button.slim {
    font-size: 12px;
    padding: 4px 10px;
  }

  .closing {
    color: var(--heat-mid);
    font-weight: 600;
    font-size: 13px;
  }

  /* ── opponents: compact status chips, one row, strip scrolls not page ── */
  .opponents {
    display: flex;
    gap: 8px;
    justify-content: safe center;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 4px;
    scrollbar-width: thin;
  }

  .opp {
    flex: 0 0 auto;
    background: rgb(17 28 23 / 72%);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 6px 8px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .opp.active {
    border-color: var(--copper);
    box-shadow: 0 0 14px rgb(200 132 58 / 25%);
  }

  .opp-line {
    display: flex;
    gap: 8px;
    align-items: baseline;
    margin-bottom: 4px;
    font-size: 12px;
  }

  .oname {
    font-weight: 600;
  }

  .opp-line .oname {
    max-width: 9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .oheat {
    color: var(--copper-bright);
    font-variant-numeric: tabular-nums;
  }

  .ototal {
    color: var(--dim);
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }

  .mini-grid {
    display: grid;
    grid-template-columns: repeat(4, auto);
    grid-auto-flow: column;
    grid-template-rows: repeat(3, auto);
    gap: 3px;
  }

  .mini {
    width: clamp(15px, 2.4vh, 24px);
    height: clamp(19px, 3vh, 30px);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: clamp(9px, 1.6vh, 13px);
    font-weight: 700;
  }

  .mini.down {
    background: linear-gradient(160deg, #1c2c24, #131f19);
    border: 1px solid rgb(35 69 52 / 60%);
  }

  .mini.etched {
    border: 1px dashed rgb(127 160 140 / 30%);
    background: transparent;
  }

  /* ── action zone: piles + banner together, centered ─────────────────── */
  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 0;
  }

  .piles {
    display: flex;
    gap: clamp(14px, 4vw, 34px);
    align-items: flex-start;
  }

  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
  }

  .plabel {
    font-size: 11px;
    white-space: nowrap;
  }

  .pile.held {
    animation: slidein 0.2s ease;
  }

  .banner {
    text-align: center;
    color: var(--dim);
    font-size: clamp(13px, 1.9vh, 15px);
    min-height: 22px;
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: center;
    padding: 0 8px;
  }

  .banner.mine-turn {
    color: var(--copper-bright);
  }

  /* ── interaction zone: my board, biggest thing on screen ───────────── */
  .mine {
    justify-self: center;
    background: rgb(17 28 23 / 72%);
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 8px 14px 12px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .mine.active {
    border-color: var(--copper);
    box-shadow: 0 0 18px rgb(200 132 58 / 22%);
  }

  .mine-line {
    display: flex;
    gap: 10px;
    align-items: baseline;
    margin-bottom: 6px;
    font-size: 13px;
  }

  .mine-line .ototal {
    margin-left: 0;
  }

  .grid4x3.big {
    gap: clamp(6px, 1vh, 10px);
  }

  /* ── chat + overlay (unchanged behavior) ─────────────────────────────── */
  .chat {
    position: fixed;
    right: 12px;
    bottom: max(12px, env(safe-area-inset-bottom));
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-end;
    z-index: 30;
  }

  .chat.open {
    background: rgb(17 28 23 / 96%);
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 10px;
    width: min(300px, 80vw);
    align-items: stretch;
  }

  .chat-toggle {
    align-self: flex-end;
    padding: 4px 10px;
  }

  .chat-lines {
    max-height: 180px;
    overflow-y: auto;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .chat input {
    font-size: 13px;
  }

  .scores {
    min-width: min(420px, 90vw);
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .scores h2 {
    color: var(--copper-bright);
  }

  .scores table {
    border-collapse: collapse;
    width: 100%;
  }

  .scores td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .total-col {
    color: var(--copper-bright);
    font-weight: 700;
  }

  .doubled {
    color: var(--danger);
    margin-left: 6px;
    font-weight: 700;
  }

  tr.winner td {
    color: var(--heat-low);
  }

  .win-line {
    margin: 0;
  }
</style>
