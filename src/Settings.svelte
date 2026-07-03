<script lang="ts">
  import { audio, setSfx, setMusic } from './sound.svelte.ts'

  let open = $state(false)
</script>

<div class="settings">
  <button class="gear" class:muted={!audio.sfx && !audio.music} onclick={() => (open = !open)} title="settings" aria-label="settings">
    {audio.sfx || audio.music ? '⚙' : '🔇'}
  </button>
  {#if open}
    <div class="pop panel">
      <label class="row">
        <input type="checkbox" checked={audio.sfx} onchange={(e) => setSfx(e.currentTarget.checked)} />
        sound effects
      </label>
      <label class="row">
        <input type="checkbox" checked={audio.music} onchange={(e) => setMusic(e.currentTarget.checked)} />
        menu music
      </label>
    </div>
  {/if}
</div>

<style>
  .settings {
    position: relative;
  }

  .gear {
    font-size: 14px;
    padding: 4px 9px;
  }

  .gear.muted {
    color: var(--dim);
  }

  .pop {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 45;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 14px;
    white-space: nowrap;
    box-shadow: 0 8px 24px rgb(0 0 0 / 50%);
  }

  label.row {
    gap: 8px;
    cursor: pointer;
    font-size: 14px;
  }
</style>
