<script lang="ts">
  import { app } from './state.svelte.ts'
  import Home from './Home.svelte'
  import Lobby from './Lobby.svelte'
  import Game from './Game.svelte'
  import Toasts from './Toasts.svelte'

  const screen = $derived(app.table === null ? 'home' : app.table.status === 'lobby' ? 'lobby' : 'game')
</script>

<Toasts />

{#if screen === 'home'}
  <Home />
{:else if screen === 'lobby'}
  <Lobby />
{:else}
  <Game />
{/if}

<footer>
  <span class="dim">chips · {app.version}</span>
  {#if !app.connected}
    <span class="offline">reconnecting…</span>
  {/if}
</footer>

<style>
  footer {
    margin-top: auto;
    padding: 10px 16px;
    display: flex;
    justify-content: space-between;
    font-size: 12px;
  }

  .offline {
    color: var(--danger);
    animation: blink 1s infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.4;
    }
  }
</style>
