<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import HowToRead from './HowToRead.svelte';

  const { open, onClose }: { open: boolean; onClose: () => void } = $props();
</script>

{#if open}
  <button
    class="modal-backdrop"
    onclick={onClose}
    aria-label="Close how-to-read modal"
    transition:fade={{ duration: 150 }}
  ></button>
  <div class="modal" transition:fly={{ y: 24, duration: 220 }}>
    <header class="modal-header">
      <p class="modal-kicker">Reading the map</p>
      <button class="modal-close" onclick={onClose} aria-label="Close">×</button>
    </header>
    <div class="modal-body">
      <HowToRead />
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(26, 24, 21, 0.40);
    z-index: 29;
    cursor: pointer;
    border: none;
    padding: 0;
  }

  .modal {
    position: fixed;
    inset: 50% auto auto 50%;
    transform: translate(-50%, -50%);
    width: min(22rem, calc(100vw - 2rem));
    max-height: calc(100vh - 2rem);
    background: var(--paper);
    border: 2px solid var(--ink);
    box-shadow: 4px 4px 0 var(--ink);
    z-index: 30;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.6rem 1rem 0.55rem;
    border-bottom: 1px solid var(--rule);
    flex-shrink: 0;
  }

  .modal-kicker {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0;
  }

  .modal-close {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-size: 1.5rem;
    line-height: 1;
    cursor: pointer;
    padding: 0;
  }

  .modal-close:hover { color: var(--ink); }

  .modal-body {
    padding: 0.5rem 1rem 1rem;
    overflow-y: auto;
  }
</style>
