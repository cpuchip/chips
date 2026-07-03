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

{#if screen !== 'game'}
  <footer>
    <span class="dim">chips · {app.version}</span>
  </footer>
{/if}
{#if !app.connected}
  <div class="offline">reconnecting…</div>
{/if}

<style>
  footer {
    margin-top: auto;
    padding: 10px 16px;
    font-size: 12px;
  }

  .offline {
    position: fixed;
    bottom: max(10px, env(safe-area-inset-bottom));
    left: 14px;
    z-index: 60;
    font-size: 12px;
    color: var(--danger);
    animation: blink 1s infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0.4;
    }
  }
</style>
