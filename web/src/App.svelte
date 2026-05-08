<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './Map.svelte';
  import SourcePanel from './SourcePanel.svelte';
  import type { FlowBundle } from './types';

  const buildDate = new Date(__BUILD_DATE__).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  let flowBundle = $state<FlowBundle | null>(null);

  onMount(async () => {
    const res = await fetch('/data/flows/2025-10.json');
    flowBundle = await res.json();
  });
</script>

<div class="app">
  <Map {flowBundle} />

  <header class="overlay-header">
    <h1>Where's the Money?</h1>
    <p class="tagline">Every pound of Kent payroll, traced to where it goes.</p>
  </header>

  <SourcePanel source={flowBundle?.source ?? null} />

  <footer class="overlay-footer">
    <span class="deploy-date">Deployed {buildDate}</span>
    <span class="separator">·</span>
    <span class="status-pill">Milestone 4 — particle simulation</span>
  </footer>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #0a0a0f;
    font-family: 'Inter', system-ui, sans-serif;
    color: #e8e8f0;
  }

  .app {
    position: relative;
    width: 100%;
    height: 100%;
  }

  :global(.maplibregl-ctrl-group) {
    background: rgba(10, 10, 20, 0.85) !important;
    border: 1px solid rgba(124, 131, 255, 0.2) !important;
    backdrop-filter: blur(6px);
  }

  :global(.maplibregl-ctrl-group button) {
    color: #a0a0b8 !important;
  }

  :global(.maplibregl-ctrl-group button:hover) {
    background: rgba(124, 131, 255, 0.15) !important;
    color: #e8e8f0 !important;
  }

  :global(.maplibregl-ctrl-attrib) {
    background: rgba(10, 10, 20, 0.7) !important;
    color: #505068 !important;
    font-size: 0.6875rem;
  }

  :global(.maplibregl-ctrl-attrib a) {
    color: #7c83ff !important;
  }

  .overlay-header {
    position: absolute;
    top: 1.5rem;
    left: 1.75rem;
    pointer-events: none;
    user-select: none;
  }

  h1 {
    font-size: clamp(1.5rem, 3vw, 2.25rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.1;
    background: linear-gradient(135deg, #e8e8f0 30%, #7c83ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .tagline {
    margin-top: 0.35rem;
    font-size: 0.8125rem;
    font-weight: 300;
    color: rgba(160, 160, 184, 0.8);
    letter-spacing: 0.01em;
  }

  .overlay-footer {
    position: absolute;
    bottom: 1rem;
    left: 1.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.6875rem;
    color: #404055;
    pointer-events: none;
    user-select: none;
  }

  .separator {
    color: #2a2a38;
  }

  .status-pill {
    color: #505068;
  }

  .deploy-date {
    color: #404055;
  }
</style>
