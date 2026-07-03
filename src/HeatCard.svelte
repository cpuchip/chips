<script lang="ts">
  // One card: a face-up heat value, a face-down chip back, or an etched pad.
  import { heatClass } from './heat.ts'

  interface Props {
    value?: number | null // null/undefined = face-down
    etched?: boolean
    clickable?: boolean
    target?: boolean // highlighted as a legal click target
    onclick?: () => void
  }

  let { value = null, etched = false, clickable = false, target = false, onclick }: Props = $props()
</script>

{#if etched}
  <div class="card pad"></div>
{:else if value === null}
  <div
    class="card back"
    class:clickable
    class:target
    onclick={clickable ? onclick : undefined}
    onkeydown={(e) => clickable && e.key === 'Enter' && onclick?.()}
    role={clickable ? 'button' : undefined}
    tabindex={clickable ? 0 : undefined}
  ></div>
{:else}
  <div
    class={`card ${heatClass(value)}`}
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
