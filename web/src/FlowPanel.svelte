<script lang="ts">
  import { fly } from 'svelte/transition';
  import type { FlowBundle, PanelSelection } from './types';
  import { FLOW_TYPES, FLOW_COLORS_HEX, FLOW_AMOUNT_KEY, parseMethodologyText } from './types';

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
    confidence: 'measured' | 'estimated' | 'modelled';
    description: string;
    amount: number;
    methodology: string;
    publisher: string;
    datasetUrl: string;
    datasetName: string;
    license: string;
    fetchedAt: string;
    color?: string;
    breakdown?: Array<{ label: string; amount: number; confidence: 'measured' | 'estimated' | 'modelled' }>;
  }

  const content = $derived.by<PanelContent | null>(() => {
    if (!selection || !flowBundle) return null;
    const src = flowBundle.source;

    if (selection.kind === 'flow') {
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
    }

    const lad = selection.lad;
    const breakdown = FLOW_TYPES.map(ft => ({
      label: flowBundle.flow_meta[ft].label,
      amount: lad.flows[FLOW_AMOUNT_KEY[ft]] as number,
      confidence: flowBundle.flow_meta[ft].confidence,
    }));

    return {
      label: lad.lad_name,
      confidence: 'measured',
      description: `${lad.employee_count.toLocaleString()} employees · £${lad.median_pay_gbp.toLocaleString()}/mo median`,
      amount: lad.total_payroll_estimate_gbp,
      methodology: src.methodology,
      publisher: src.publisher,
      datasetUrl: src.dataset_url,
      datasetName: src.name,
      license: src.license,
      fetchedAt: src.fetched_at,
      breakdown,
    };
  });

  const segments = $derived(
    content ? parseMethodologyText(content.methodology, glossary) : [],
  );

  function formatGbp(n: number): string {
    if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
    return `£${(n / 1_000_000).toFixed(0)}m`;
  }

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
      <div class="panel-badges">
        <span class="badge {content.confidence}">{content.confidence}</span>
        {#if content.color}
          <span class="flow-dot" style="background:{content.color};box-shadow:0 0 5px 2px {content.color};"></span>
        {/if}
      </div>
      <button class="close-btn" onclick={onClose} aria-label="Close panel">×</button>
    </div>

    <h2 class="panel-title">{content.label}</h2>
    <p class="panel-desc">{content.description}</p>

    <div class="amount-row">
      <span class="amount-value">{formatGbp(content.amount)}</span>
      <span class="amount-label">/month</span>
    </div>

    <div class="divider"></div>

    <div class="section">
      <div class="section-label">Methodology</div>
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

    {#if content.breakdown}
      <div class="divider"></div>
      <div class="section">
        <div class="section-label">Flow breakdown</div>
        {#each content.breakdown as row}
          <div class="breakdown-row">
            <span class="breakdown-label">{row.label}</span>
            <div class="breakdown-right">
              <span class="breakdown-amount">{formatGbp(row.amount)}</span>
              <span class="badge-sm {row.confidence}">{row.confidence}</span>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="divider"></div>

    <div class="section source-section">
      <div class="section-label">Source</div>
      <div class="source-publisher">{content.publisher}</div>
      <a class="source-link" href={content.datasetUrl} target="_blank" rel="noopener noreferrer">
        {content.datasetName.length > 50 ? content.datasetName.slice(0, 50) + '…' : content.datasetName} ↗
      </a>
      <div class="source-meta">
        <span class="badge license">{content.license}</span>
        <span class="source-fetched">Fetched {formatDate(content.fetchedAt)}</span>
      </div>
    </div>
  </aside>
{/if}

<style>
  .flow-panel {
    position: absolute;
    top: 50%;
    right: 0.75rem;
    transform: translateY(-50%);
    width: 18rem;
    max-height: 68vh;
    overflow-y: auto;
    background: rgba(8, 8, 20, 0.92);
    border: 1px solid rgba(124, 131, 255, 0.22);
    border-radius: 8px;
    padding: 0.875rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    backdrop-filter: blur(10px);
    font-size: 0.75rem;
    color: #a0a0b8;
    z-index: 10;
    scrollbar-width: thin;
    scrollbar-color: rgba(124, 131, 255, 0.2) transparent;
  }

  .panel-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-badges {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: #404055;
    font-size: 1.125rem;
    cursor: pointer;
    line-height: 1;
    padding: 0;
    transition: color 0.15s;
  }

  .close-btn:hover {
    color: #a0a0b8;
  }

  .badge {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    padding: 0.12rem 0.4rem;
    border-radius: 3px;
  }

  .badge-sm {
    font-size: 0.5rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.08rem 0.3rem;
    border-radius: 2px;
  }

  .measured,
  .badge-sm.measured {
    background: rgba(64, 196, 128, 0.12);
    color: #40c480;
    border: 1px solid rgba(64, 196, 128, 0.28);
  }

  .estimated,
  .badge-sm.estimated {
    background: rgba(240, 160, 48, 0.12);
    color: #f0a030;
    border: 1px solid rgba(240, 160, 48, 0.28);
  }

  .modelled,
  .badge-sm.modelled {
    background: rgba(124, 131, 255, 0.12);
    color: #7c83ff;
    border: 1px solid rgba(124, 131, 255, 0.28);
  }

  .license {
    background: rgba(124, 131, 255, 0.08);
    color: #5a61c0;
    border: 1px solid rgba(124, 131, 255, 0.18);
    font-size: 0.5625rem;
  }

  .flow-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .panel-title {
    font-size: 1rem;
    font-weight: 700;
    color: #e8e8f0;
    letter-spacing: -0.01em;
    line-height: 1.2;
    margin: 0;
  }

  .panel-desc {
    font-size: 0.6875rem;
    color: #6a6a88;
    line-height: 1.4;
    margin: 0;
  }

  .amount-row {
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    margin: 0.1rem 0;
  }

  .amount-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #e8e8f0;
    letter-spacing: -0.02em;
    line-height: 1;
  }

  .amount-label {
    font-size: 0.6875rem;
    color: #404055;
  }

  .divider {
    height: 1px;
    background: rgba(124, 131, 255, 0.1);
    margin: 0.1rem 0;
    flex-shrink: 0;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .section-label {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #404055;
  }

  .methodology-text {
    font-size: 0.6875rem;
    line-height: 1.55;
    color: #6a6a88;
    margin: 0;
  }

  .glossary-term {
    background: none;
    border: none;
    border-bottom: 1px dashed rgba(124, 131, 255, 0.45);
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
    border-bottom-color: rgba(124, 131, 255, 0.8);
  }

  .term-callout {
    background: rgba(20, 20, 40, 0.95);
    border: 1px solid rgba(124, 131, 255, 0.3);
    border-radius: 5px;
    padding: 0.6rem 0.7rem;
    margin-top: 0.1rem;
  }

  .term-callout-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3rem;
  }

  .term-callout-name {
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.04em;
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
    line-height: 1.5;
    color: #8a8aa8;
    margin: 0;
  }

  .breakdown-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.2rem 0;
    border-bottom: 1px solid rgba(124, 131, 255, 0.06);
  }

  .breakdown-row:last-child {
    border-bottom: none;
  }

  .breakdown-label {
    color: #7a7a98;
    font-size: 0.6875rem;
  }

  .breakdown-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .breakdown-amount {
    font-size: 0.75rem;
    font-weight: 600;
    color: #c0c0d8;
    letter-spacing: -0.01em;
  }

  .source-section {
    padding-bottom: 0.25rem;
  }

  .source-publisher {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #c0c0d8;
  }

  .source-link {
    color: #7c83ff;
    text-decoration: none;
    font-size: 0.6875rem;
    line-height: 1.4;
    word-break: break-word;
    transition: color 0.12s;
  }

  .source-link:hover {
    color: #a0a6ff;
    text-decoration: underline;
  }

  .source-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .source-fetched {
    font-size: 0.5625rem;
    color: #32324a;
  }
</style>
