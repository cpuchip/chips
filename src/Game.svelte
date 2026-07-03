<script lang="ts">
  import { app } from './state.svelte.ts'
  import { send } from './net.ts'
  import HeatCard from './HeatCard.svelte'
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
    if (mode === 'discardSwap') return `place the ${v.discardTop} — click one of your cards to swap it out`
    if (mode === 'flipChoose') return 'click a face-down card to flip it'
    if (v.held !== null) return `you drew a ${v.held} — place it, or toss it and flip`
    return 'your move: take the discard, or draw from the stack'
  })

  function sendChat(): void {
    const text = chatText.trim()
    if (text) send({ t: 'chat', text })
    chatText = ''
  }
</script>

{#if v !== null}
  <main>
    <header class="row">
      <h2 class="trace-title">heatsink</h2>
      <span class="dim">round {v.round}</span>
      {#if v.closer !== null && v.phase === 'play'}
        <span class="closing">⚠ {seatName(v.closer)} is done — last turns!</span>
      {/if}
      <button class="leave" onclick={() => send({ t: 'leaveTable' })}>Leave</button>
    </header>

    <section class="opponents">
      {#each v.players as p, i (i)}
        {#if i !== me}
          <div class="opp panel" class:active={v.phase === 'play' && v.turn === i}>
            <div class="row opp-head">
              <span class="oname">{seatName(i)}</span>
              <span class="dim heat">{sum(p)}°</span>
            </div>
            <div class="grid4x3">
              {#each p.grid as c, j (j)}
                <HeatCard small value={c === null ? null : c.up ? c.v : null} etched={c === null} />
              {/each}
            </div>
            <div class="dim total">total {v.totals[i]}</div>
          </div>
        {/if}
      {/each}
    </section>

    <section class="center">
      <div class="pile">
        <HeatCard clickable={myTurn && v.held === null && mode === 'idle'} target={myTurn && v.held === null && mode === 'idle'} onclick={clickDraw} />
        <span class="dim">stack · {v.drawCount}</span>
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
        <span class="dim">discard</span>
      </div>
      {#if v.held !== null}
        <div class="pile held">
          <HeatCard value={v.held} />
          <span class="dim">drawn</span>
        </div>
      {/if}
    </section>

    <section class="banner" class:mine={myTurn || (inFlip && myFlipsLeft > 0)}>
      {banner}
      {#if mode !== 'idle'}
        <button onclick={() => (mode = 'idle')}>cancel</button>
      {/if}
    </section>

    <section class="mine panel" class:active={myTurn}>
      <div class="row opp-head">
        <span class="oname">{me >= 0 ? seatName(me) : ''} (you)</span>
        <span class="dim heat">{me >= 0 ? sum(v.players[me]) : 0}°</span>
        <span class="dim total-inline">total {me >= 0 ? v.totals[me] : 0}</span>
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
  main {
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
    padding: 14px 14px 4px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  header {
    flex-wrap: wrap;
  }

  .leave {
    margin-left: auto;
    font-size: 13px;
    padding: 5px 12px;
  }

  .closing {
    color: var(--heat-mid);
    font-weight: 600;
  }

  .opponents {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .opp {
    padding: 10px;
    border-radius: 10px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .opp.active,
  .mine.active {
    border-color: var(--copper);
    box-shadow: 0 0 18px rgb(200 132 58 / 22%);
  }

  .opp-head {
    margin-bottom: 8px;
    gap: 8px;
  }

  .oname {
    font-weight: 600;
  }

  .heat {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }

  .total,
  .total-inline {
    font-size: 12px;
    margin-top: 6px;
  }

  .center {
    display: flex;
    gap: 26px;
    justify-content: center;
    align-items: flex-start;
    min-height: calc(var(--card-h) + 26px);
  }

  .pile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .pile.held {
    animation: slidein 0.2s ease;
  }

  .banner {
    text-align: center;
    color: var(--dim);
    min-height: 26px;
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: center;
  }

  .banner.mine {
    color: var(--copper-bright);
  }

  .banner button {
    font-size: 12px;
    padding: 3px 10px;
  }

  .mine {
    align-self: center;
    padding: 14px;
  }

  .grid4x3.big {
    gap: 10px;
  }

  .chat {
    position: fixed;
    right: 12px;
    bottom: 44px;
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
