<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { FlowBundle } from './types';
  import { FLOW_TYPES, parseMethodologyText } from './types';

  const { open, flowBundle, glossary, onClose }: {
    open: boolean;
    flowBundle: FlowBundle | null;
    glossary: Record<string, string>;
    onClose: () => void;
  } = $props();

  let activeTerm = $state<string | null>(null);

  function toggleTerm(term: string) {
    activeTerm = activeTerm === term ? null : term;
  }

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }
</script>

{#if open && flowBundle}
  {@const src = flowBundle.source}
  {@const srcSegs = parseMethodologyText(src.methodology, glossary)}
  <button class="drawer-overlay" onclick={onClose} aria-label="Close methodology drawer"></button>
  <div class="drawer" transition:fly={{ y: 60, duration: 280 }}>
    <div class="drawer-header">
      <h2 class="drawer-title">Data Sources &amp; Methodology</h2>
      <button class="drawer-close" onclick={onClose} aria-label="Close methodology drawer">×</button>
    </div>

    <div class="drawer-body">
      <!-- Payroll estimate: PAYE RTI source -->
      <section class="method-section">
        <div class="method-header">
          <span class="method-label">Payroll Estimate</span>
          <span class="badge measured">measured</span>
        </div>
        <p class="method-source-line">
          <a class="src-link" href={src.dataset_url} target="_blank" rel="noopener noreferrer">
            {src.name} ↗
          </a>
          <span class="src-meta">{src.publisher} · {src.license} · Fetched {formatDate(src.fetched_at)}</span>
        </p>
        <p class="method-text">
          {#each srcSegs as seg}
            {#if seg.term}
              <button
                class="glossary-term"
                class:active={activeTerm === seg.term}
                onclick={() => toggleTerm(seg.term!)}
              >{seg.text}</button>
            {:else}
              {seg.text}
            {/if}
          {/each}
        </p>
      </section>

      <!-- Per-flow methodology sections -->
      {#each FLOW_TYPES as ft}
        {@const meta = flowBundle.flow_meta[ft]}
        {#if meta}
          {@const segs = parseMethodologyText(meta.methodology, glossary)}
          <div class="section-divider"></div>
          <section class="method-section">
            <div class="method-header">
              <span class="method-label">{meta.label}</span>
              <span class="badge {meta.confidence}">{meta.confidence}</span>
            </div>
            <p class="method-desc">{meta.description}</p>
            <p class="method-text">
              {#each segs as seg}
                {#if seg.term}
                  <button
                    class="glossary-term"
                    class:active={activeTerm === seg.term}
                    onclick={() => toggleTerm(seg.term!)}
                  >{seg.text}</button>
                {:else}
                  {seg.text}
                {/if}
              {/each}
            </p>
          </section>
        {/if}
      {/each}

      <!-- Sticky term definition callout -->
      {#if activeTerm && glossary[activeTerm]}
        <div class="term-callout" transition:fly={{ y: 6, duration: 150 }}>
          <div class="term-callout-header">
            <span class="term-callout-name">{activeTerm}</span>
            <button class="term-callout-close" onclick={() => activeTerm = null}>×</button>
          </div>
          <p class="term-callout-def">{glossary[activeTerm]}</p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .drawer-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 19;
    cursor: pointer;
    border: none;
    padding: 0;
  }

  .drawer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 55vh;
    background: rgba(7, 7, 18, 0.97);
    border-top: 1px solid rgba(124, 131, 255, 0.22);
    backdrop-filter: blur(12px);
    z-index: 20;
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    color: #a0a0b8;
  }

  .drawer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.875rem 1.5rem 0.75rem;
    border-bottom: 1px solid rgba(124, 131, 255, 0.1);
    flex-shrink: 0;
  }

  .drawer-title {
    font-size: 0.8125rem;
    font-weight: 700;
    color: #c0c0d8;
    letter-spacing: 0.01em;
    margin: 0;
  }

  .drawer-close {
    background: none;
    border: none;
    color: #404055;
    font-size: 1.25rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: color 0.15s;
  }

  .drawer-close:hover {
    color: #a0a0b8;
  }

  .drawer-body {
    overflow-y: auto;
    padding: 0.25rem 1.5rem 1.5rem;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: rgba(124, 131, 255, 0.2) transparent;
  }

  .method-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.75rem 0;
  }

  .section-divider {
    height: 1px;
    background: rgba(124, 131, 255, 0.08);
    flex-shrink: 0;
  }

  .method-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .method-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #d0d0e8;
    letter-spacing: 0.01em;
  }

  .badge {
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 0.1rem 0.35rem;
    border-radius: 3px;
  }

  .measured {
    background: rgba(64, 196, 128, 0.12);
    color: #40c480;
    border: 1px solid rgba(64, 196, 128, 0.28);
  }

  .estimated {
    background: rgba(240, 160, 48, 0.12);
    color: #f0a030;
    border: 1px solid rgba(240, 160, 48, 0.28);
  }

  .modelled {
    background: rgba(124, 131, 255, 0.12);
    color: #7c83ff;
    border: 1px solid rgba(124, 131, 255, 0.28);
  }

  .method-source-line {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
  }

  .src-link {
    color: #7c83ff;
    text-decoration: none;
    font-size: 0.6875rem;
    transition: color 0.12s;
  }

  .src-link:hover {
    color: #a0a6ff;
    text-decoration: underline;
  }

  .src-meta {
    font-size: 0.5625rem;
    color: #383850;
  }

  .method-desc {
    font-size: 0.6875rem;
    color: #5a5a78;
    margin: 0;
    font-style: italic;
  }

  .method-text {
    font-size: 0.6875rem;
    line-height: 1.6;
    color: #6a6a88;
    margin: 0;
  }

  .glossary-term {
    background: none;
    border: none;
    border-bottom: 1px dashed rgba(124, 131, 255, 0.4);
    color: #8a90d8;
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    padding: 0;
    display: inline;
    transition: color 0.12s, border-color 0.12s;
  }

  .glossary-term:hover,
  .glossary-term.active {
    color: #b0b6ff;
    border-bottom-color: rgba(124, 131, 255, 0.75);
  }

  .term-callout {
    position: sticky;
    bottom: 0;
    background: rgba(14, 14, 32, 0.98);
    border: 1px solid rgba(124, 131, 255, 0.3);
    border-radius: 6px;
    padding: 0.7rem 0.875rem;
    margin-top: 0.75rem;
  }

  .term-callout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.35rem;
  }

  .term-callout-name {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #7c83ff;
  }

  .term-callout-close {
    background: none;
    border: none;
    color: #404055;
    font-size: 0.875rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    transition: color 0.12s;
  }

  .term-callout-close:hover {
    color: #a0a0b8;
  }

  .term-callout-def {
    font-size: 0.6875rem;
    line-height: 1.55;
    color: #8a8aa8;
    margin: 0;
  }
</style>
