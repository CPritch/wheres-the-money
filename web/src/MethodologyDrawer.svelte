<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { FlowBundle } from './types';
  import {
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    CATEGORY_COLORS_HEX,
    FLOWS_BY_CATEGORY,
    parseMethodologyText,
  } from './types';

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
    <header class="drawer-header">
      <div>
        <p class="drawer-kicker">Phase 1 · October 2025 · Kent &amp; Medway</p>
        <h2 class="drawer-title">Sources <em>&amp;</em> Methodology</h2>
      </div>
      <button class="drawer-close" onclick={onClose} aria-label="Close methodology drawer">×</button>
    </header>

    <div class="drawer-body">
      <section class="method-section">
        <div class="method-header">
          <p class="method-kicker">Payroll estimate</p>
          <span class="pill pill-measured">measured</span>
        </div>
        <p class="src-line">
          <a class="src-link" href={src.dataset_url} target="_blank" rel="noopener noreferrer">
            {src.name} &rsaquo;
          </a>
          <span class="src-meta">
            {src.publisher} · {src.license} · Fetched {formatDate(src.fetched_at)}
          </span>
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

      {#each CATEGORY_ORDER as cat}
        <div class="section-divider">
          <span class="cat-rule-dot" style="background:{CATEGORY_COLORS_HEX[cat]};"></span>
          <span class="cat-rule-name" style="color:{CATEGORY_COLORS_HEX[cat]};">
            {CATEGORY_LABELS[cat]}
          </span>
          <span class="cat-rule-line"></span>
        </div>

        {#each FLOWS_BY_CATEGORY[cat] as ft}
          {@const meta = flowBundle.flow_meta[ft]}
          {#if meta}
            {@const segs = parseMethodologyText(meta.methodology, glossary)}
            <section class="method-section">
              <div class="method-header">
                <p class="method-kicker">{meta.label}</p>
                <span class="pill pill-{meta.confidence}">{meta.confidence}</span>
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
      {/each}

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
    background: rgba(26, 24, 21, 0.30);
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
    height: 62vh;
    background: var(--paper);
    border-top: 2px solid var(--ink);
    z-index: 20;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', sans-serif;
    color: var(--ink);
  }

  .drawer-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1rem 2rem 0.75rem;
    border-bottom: 1px solid var(--rule);
    flex-shrink: 0;
  }

  .drawer-kicker {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0 0 0.15rem;
  }

  .drawer-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 1.85rem;
    color: var(--ink);
    margin: 0;
    line-height: 1;
    letter-spacing: -0.005em;
  }

  .drawer-title em {
    color: var(--ink-mute);
    font-weight: 400;
  }

  .drawer-close {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-size: 1.4rem;
    cursor: pointer;
    line-height: 1;
    padding: 0.2rem 0.3rem;
  }

  .drawer-close:hover { color: var(--ink); }

  .drawer-body {
    overflow-y: auto;
    padding: 0.5rem 2rem 1.75rem;
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--rule) transparent;
    max-width: 60rem;
    margin: 0 auto;
    width: 100%;
  }

  .method-section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    padding: 0.75rem 0;
  }

  .section-divider {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding-top: 0.7rem;
    margin-top: 0.5rem;
  }

  .cat-rule-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cat-rule-name {
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .cat-rule-line {
    flex: 1;
    height: 1px;
    background: var(--rule-strong);
  }

  .method-header {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .method-kicker {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 1.15rem;
    color: var(--ink);
    margin: 0;
    letter-spacing: -0.005em;
  }

  .pill {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.12rem 0.4rem;
    border: 1px solid currentColor;
  }

  .pill-measured  { color: var(--confidence-measured); }
  .pill-estimated { color: var(--confidence-estimated); }
  .pill-modelled  { color: var(--confidence-modelled); }

  .src-line {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin: 0;
  }

  .src-link {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.95rem;
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--rule);
  }

  .src-link:hover {
    text-decoration-color: var(--ink);
  }

  .src-meta {
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    color: var(--ink-mute);
    letter-spacing: 0.02em;
  }

  .method-desc {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.9rem;
    color: var(--ink-mute);
    margin: 0;
  }

  .method-text {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.95rem;
    line-height: 1.55;
    color: var(--ink-soft);
    margin: 0;
  }

  .glossary-term {
    background: none;
    border: none;
    border-bottom: 1px dashed var(--ink-mute);
    color: var(--ink);
    cursor: pointer;
    font-size: inherit;
    font-family: inherit;
    font-style: italic;
    padding: 0;
    display: inline;
  }

  .glossary-term:hover,
  .glossary-term.active {
    color: var(--statutory);
    border-bottom-color: var(--statutory);
  }

  .term-callout {
    position: sticky;
    bottom: 0;
    background: var(--paper-deep);
    border-left: 3px solid var(--ink);
    padding: 0.75rem 1rem;
    margin-top: 0.75rem;
  }

  .term-callout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  .term-callout-name {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .term-callout-close {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-size: 1rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .term-callout-close:hover { color: var(--ink); }

  .term-callout-def {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--ink-soft);
    margin: 0;
  }
</style>
