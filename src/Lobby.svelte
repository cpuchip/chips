<script lang="ts">
  import { app, pushToast } from './state.svelte.ts'
  import { send } from './net.ts'

  const table = $derived(app.table!)
  const isHost = $derived(table.yourSeat === table.hostSeat)
  const canStart = $derived(table.seats.length >= 2)

  function copyCode(): void {
    navigator.clipboard?.writeText(table.code).then(
      () => pushToast('code copied'),
      () => pushToast(table.code),
    )
  }
</script>

<main>
  <div class="panel">
    <div class="row head">
      <h2>{table.name}</h2>
      <button class="code" onclick={copyCode} title="copy join code">{table.code} ⧉</button>
      {#if table.isPrivate}<span class="tag">private</span>{/if}
    </div>
    <p class="dim">
      {table.isPrivate ? 'share the code with your players' : 'anyone can join from the lobby — or share the code'}
    </p>

    <ul class="seats">
      {#each table.seats as seat, i (i)}
        <li class:me={i === table.yourSeat}>
          <span class="chip-dot" class:bot={seat.isBot} class:offline={!seat.connected}></span>
          <span>{seat.name}</span>
          {#if i === table.hostSeat}<span class="tag">host</span>{/if}
          {#if seat.isBot}<span class="tag">bot</span>{/if}
          {#if !seat.connected && !seat.isBot}<span class="tag off">away</span>{/if}
        </li>
      {/each}
    </ul>

    <div class="row wrap actions">
      {#if isHost}
        <button onclick={() => send({ t: 'addBot' })} disabled={table.seats.length >= 8}>+ bot</button>
        <button onclick={() => send({ t: 'removeBot' })} disabled={!table.seats.some((s) => s.isBot)}>− bot</button>
        <button class="primary" onclick={() => send({ t: 'startGame' })} disabled={!canStart}>
          Start game
        </button>
        {#if !canStart}<span class="dim">need at least 2 seats — add a bot?</span>{/if}
      {:else}
        <span class="dim">waiting for {table.seats[table.hostSeat]?.name ?? 'the host'} to start…</span>
      {/if}
      <button class="leave" onclick={() => send({ t: 'leaveTable' })}>Leave</button>
    </div>
  </div>
</main>

<style>
  main {
    max-width: 620px;
    width: 100%;
    margin: 40px auto 0;
    padding: 0 16px;
  }

  .head {
    flex-wrap: wrap;
  }

  .head h2 {
    color: var(--copper-bright);
  }

  .code {
    font-weight: 700;
    letter-spacing: 0.25em;
    padding: 6px 12px;
  }

  .tag {
    font-size: 12px;
    color: var(--dim);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 10px;
  }

  .tag.off {
    color: var(--danger);
  }

  .seats {
    list-style: none;
    margin: 16px 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .seats li {
    display: flex;
    gap: 10px;
    align-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .seats li.me {
    border-color: var(--copper);
  }

  .chip-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    background: var(--heat-low);
    box-shadow: 0 0 8px rgb(74 222 128 / 50%);
  }

  .chip-dot.bot {
    background: var(--heat-cold);
    box-shadow: 0 0 8px rgb(96 165 250 / 50%);
  }

  .chip-dot.offline {
    background: var(--dim);
    box-shadow: none;
  }

  .actions {
    margin-top: 8px;
    flex-wrap: wrap;
  }

  .leave {
    margin-left: auto;
  }
</style>
