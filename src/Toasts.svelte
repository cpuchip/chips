<script lang="ts">
  import { app } from './state.svelte.ts'
</script>

<div class="toasts">
  {#each app.toasts as t (t.id)}
    <div class="toast">{t.msg}</div>
  {/each}
</div>
