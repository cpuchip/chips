<script lang="ts">
  // One card: a face-up heat value, a face-down chip back, or an etched pad.
  interface Props {
    value?: number | null // null/undefined = face-down
    etched?: boolean
    small?: boolean
    clickable?: boolean
    target?: boolean // highlighted as a legal click target
    onclick?: () => void
  }

  let { value = null, etched = false, small = false, clickable = false, target = false, onclick }: Props = $props()

  function heatClass(v: number): string {
    if (v <= -1) return 'heat-sink'
    if (v === 0) return 'heat-zero'
    if (v <= 4) return 'heat-low'
    if (v <= 8) return 'heat-mid'
    return 'heat-high'
  }
</script>

{#if etched}
  <div class="card pad" class:small></div>
{:else if value === null}
  <div
    class="card back"
    class:small
    class:clickable
    class:target
    onclick={clickable ? onclick : undefined}
    onkeydown={(e) => clickable && e.key === 'Enter' && onclick?.()}
    role={clickable ? 'button' : undefined}
    tabindex={clickable ? 0 : undefined}
  >
    <span class="die">▦</span>
  </div>
{:else}
  <div
    class={`card ${heatClass(value)}`}
    class:small
    class:clickable
    class:target
    onclick={clickable ? onclick : undefined}
    onkeydown={(e) => clickable && e.key === 'Enter' && onclick?.()}
    role={clickable ? 'button' : undefined}
    tabindex={clickable ? 0 : undefined}
  >
    {value}
  </div>
{/if}
