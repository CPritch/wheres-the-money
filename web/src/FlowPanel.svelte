<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { Confidence, FlowBundle, PanelSelection } from './types';
  import {
    FLOW_COLORS_HEX,
    FLOW_AMOUNT_KEY,
    parseMethodologyText,
    formatGbp,
  } from './types';

  const { selection, flowBundle, glossary, onClose }: {
    selection: PanelSelection;
    flowBundle: FlowBundle | null;
    glossary: Record<string, string>;
    onClose: () => void;
  } = $props();

  let activeTerm = $state<string | null>(null);

  $effect(() => {
    void selection;
    activeTerm = null;
  });

  interface PanelContent {
    label: string;
    confidence: Confidence;
    description: string;
    amount: number;
    methodology: string;
    publisher: string;
    datasetUrl: string;
    datasetName: string;
    license: string;
    fetchedAt: string;
    color: string;
    breakdown?: Array<{ label: string; amount: number; confidence: Confidence; color: string }>;
  }

  const content = $derived.by<PanelContent | null>(() => {
    if (!selection || !flowBundle) return null;
    if (selection.kind === 'lad') return null;
    if (selection.kind === 'overall') return null;
    const src = flowBundle.source;
    const meta = flowBundle.flow_meta[selection.type];
    if (!meta) return null;
    const amount = flowBundle.lads.reduce(
      (s, l) => s + (l.flows[FLOW_AMOUNT_KEY[selection.type]] as number),
      0,
    );
    return {
      label: meta.label,
      confidence: meta.confidence,
      description: meta.description,
      amount,
      methodology: meta.methodology,
      publisher: src.publisher,
      datasetUrl: src.dataset_url,
      datasetName: src.name,
      license: src.license,
      fetchedAt: src.fetched_at,
      color: FLOW_COLORS_HEX[selection.type],
    };
  });

  const segments = $derived(
    content ? parseMethodologyText(content.methodology, glossary) : [],
  );

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  function toggleTerm(term: string) {
    activeTerm = activeTerm === term ? null : term;
  }
</script>

{#if content}
  <aside class="flow-panel" transition:fly={{ x: 24, duration: 200 }}>
    <div class="panel-top">
      <span class="panel-kicker" style="color:{content.color};">
        <span class="kicker-dot" style="background:{content.color};"></span>
        Flow detail
      </span>
      <button class="close-btn" onclick={onClose} aria-label="Close panel">×</button>
    </div>

    <h2 class="panel-title">{content.label}</h2>
    <p class="panel-desc">{content.description}</p>

    <div class="amount-row">
      <span class="amount-value">{formatGbp(content.amount)}</span>
      <span class="amount-label">/month</span>
      <span class="pill pill-{content.confidence}">{content.confidence}</span>
    </div>

    <div class="rule"></div>

    <div class="section">
      <p class="section-kicker">Methodology</p>
      <p class="methodology-text">
        {#each segments as seg}
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
      {#if activeTerm && glossary[activeTerm]}
        <div class="term-callout" transition:fly={{ y: -4, duration: 150 }}>
          <div class="term-callout-header">
            <span class="term-callout-name">{activeTerm}</span>
            <button class="term-callout-close" onclick={() => activeTerm = null}>×</button>
          </div>
          <p class="term-callout-def">{glossary[activeTerm]}</p>
        </div>
      {/if}
    </div>

    <div class="rule"></div>

    <div class="section">
      <p class="section-kicker">Source</p>
      <p class="src-publisher">{content.publisher}</p>
      <a class="src-link" href={content.datasetUrl} target="_blank" rel="noopener noreferrer">
        {content.datasetName.length > 60 ? content.datasetName.slice(0, 60) + '…' : content.datasetName} &rsaquo;
      </a>
      <div class="src-meta">
        <span class="src-pill">{content.license}</span>
        <span class="src-fetched">Fetched {formatDate(content.fetchedAt)}</span>
      </div>
    </div>
  </aside>
{/if}

<style>
  .flow-panel {
    position: absolute;
    top: 50%;
    right: 22rem;
    transform: translateY(-50%);
    margin-right: 0.75rem;
    width: 19rem;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--paper-soft);
    border: 1px solid var(--ink);
    padding: 1rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    font-family: 'Inter', sans-serif;
    color: var(--ink);
    z-index: 10;
    box-shadow: 2px 2px 0 var(--ink);
    scrollbar-width: thin;
    scrollbar-color: var(--rule) transparent;
  }

  .panel-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-kicker {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .kicker-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-size: 1.25rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .close-btn:hover { color: var(--ink); }

  .panel-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 1.7rem;
    line-height: 1.05;
    color: var(--ink);
    letter-spacing: -0.005em;
    margin: 0;
  }

  .panel-desc {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--ink-soft);
    font-style: italic;
    margin: 0;
  }

  .amount-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .amount-value {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 1.85rem;
    color: var(--ink);
    letter-spacing: -0.01em;
    line-height: 1;
  }

  .amount-label {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }

  .pill {
    font-family: 'Inter', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border: 1px solid currentColor;
    margin-left: auto;
  }

  .pill-measured  { color: var(--confidence-measured); }
  .pill-estimated { color: var(--confidence-estimated); }
  .pill-modelled  { color: var(--confidence-modelled); }

  .rule {
    height: 1px;
    background: var(--rule);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .section-kicker {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0;
  }

  .methodology-text {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    line-height: 1.5;
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
    background: var(--paper-deep);
    border-left: 2px solid var(--ink);
    padding: 0.55rem 0.7rem;
    margin-top: 0.15rem;
  }

  .term-callout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  .term-callout-name {
    font-family: 'Inter', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .term-callout-close {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-size: 0.95rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .term-callout-close:hover { color: var(--ink); }

  .term-callout-def {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    line-height: 1.45;
    color: var(--ink-soft);
    margin: 0;
  }

  .src-publisher {
    font-family: 'Inter', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink);
    margin: 0;
  }

  .src-link {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    color: var(--ink);
    font-size: 0.85rem;
    line-height: 1.35;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--rule);
  }

  .src-link:hover { text-decoration-color: var(--ink); }

  .src-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .src-pill {
    font-family: 'Inter', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    padding: 0.1rem 0.4rem;
    border: 1px solid var(--ink);
    color: var(--ink);
  }

  .src-fetched {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.78rem;
    color: var(--ink-mute);
  }

  /* ── Mobile ─────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .flow-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      right: auto;
      margin-right: 0;
      transform: translate(-50%, -50%);
      width: calc(100vw - 1.5rem);
      max-width: 24rem;
      max-height: 80vh;
      z-index: 25;
    }

    .panel-title {
      font-size: 1.4rem;
    }

    .amount-value {
      font-size: 1.55rem;
    }
  }
</style>
