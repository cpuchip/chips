<script lang="ts">
  import { app, saveName } from './state.svelte.ts'
  import { send } from './net.ts'

  let joinCode = $state('')
  let tableName = $state('')
  let isPrivate = $state(false)

  function ensureName(): void {
    const name = app.name.trim() || 'player'
    saveName(name)
    send({ t: 'setName', name })
  }

  function create(): void {
    ensureName()
    send({ t: 'createTable', game: 'heatsink', name: tableName.trim(), isPrivate })
  }

  function join(code: string): void {
    ensureName()
    send({ t: 'joinTable', code: code.trim().toUpperCase() })
  }
</script>

<main>
  <header class="row">
    <img class="mark" src="/assets/logo.png" alt="chips logo" />
    <div>
      <h1 class="trace-title">chips</h1>
      <p class="dim">games by cpuchip — pull up a chair</p>
    </div>
  </header>

  <section class="panel callsign">
    <label for="callsign" class="dim">callsign</label>
    <input id="callsign" type="text" maxlength="20" bind:value={app.name} onchange={ensureName} placeholder="who's playing?" />
  </section>

  <section class="games">
    <div class="panel game featured">
      <div class="game-head">
        <h2>Heatsink</h2>
        <span class="tag">card game · 2–8 players</span>
      </div>
      <p>
        You're assembling a chip — and it runs <em>hot</em>. Swap components, hunt matching columns to etch them
        off the board, and keep your total heat lower than everyone else. Coolest chip wins.
      </p>

      <div class="table-actions">
        <div class="row wrap">
          <input type="text" placeholder="table name (optional)" maxlength="30" bind:value={tableName} />
          <label class="row checkbox"><input type="checkbox" bind:checked={isPrivate} /> private</label>
          <button class="primary" onclick={create}>Create table</button>
        </div>
        <div class="row">
          <input
            type="text"
            placeholder="join code"
            maxlength="4"
            bind:value={joinCode}
            style="width: 7em; text-transform: uppercase"
            onkeydown={(e) => e.key === 'Enter' && join(joinCode)}
          />
          <button onclick={() => join(joinCode)} disabled={joinCode.trim().length !== 4}>Join private table</button>
        </div>
      </div>

      {#if app.tables.length > 0}
        <h3 class="dim open-title">open tables</h3>
        <div class="tables">
          {#each app.tables as t (t.code)}
            <div class="table-row">
              <span class="tname">{t.name}</span>
              <span class="dim">{t.seats}/{t.capacity}</span>
              <span class="dim">{t.status === 'lobby' ? 'gathering' : 'playing'}</span>
              <button disabled={t.status !== 'lobby' || t.seats >= t.capacity} onclick={() => join(t.code)}>Join</button>
            </div>
          {/each}
        </div>
      {:else}
        <p class="dim">no open tables right now — start one!</p>
      {/if}
    </div>

    <div class="panel game soon">
      <h2>Cooldown</h2>
      <span class="tag">coming soon</span>
    </div>
    <div class="panel game soon">
      <h2>Overclock</h2>
      <span class="tag">coming soon</span>
    </div>
  </section>
</main>

<style>
  main {
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
    padding: 28px 16px 8px;
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  header h1 {
    font-size: 42px;
  }

  header p {
    margin: 4px 0 0;
  }

  .mark {
    width: 84px;
    height: 84px;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgb(0 0 0 / 50%));
  }

  .callsign {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 16px;
  }

  .callsign input {
    flex: 1;
    max-width: 280px;
  }

  .games {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .game-head {
    display: flex;
    gap: 12px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .game h2 {
    color: var(--copper-bright);
  }

  .tag {
    font-size: 12px;
    color: var(--dim);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 10px;
  }

  .featured p {
    line-height: 1.5;
  }

  .table-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 10px 0 4px;
  }

  .row.wrap {
    flex-wrap: wrap;
  }

  .checkbox {
    gap: 6px;
    color: var(--dim);
  }

  .open-title {
    margin-top: 14px;
  }

  .tables {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1fr auto auto auto;
    gap: 12px;
    align-items: center;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 12px;
  }

  .tname {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .soon {
    opacity: 0.55;
    display: flex;
    gap: 12px;
    align-items: baseline;
  }
</style>
