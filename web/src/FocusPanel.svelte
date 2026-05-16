<script lang="ts">
  import type { FlowBundle, FlowType, LadData } from './types';
  import {
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    CATEGORY_COLORS_HEX,
    FLOWS_BY_CATEGORY,
    FLOW_AMOUNT_KEY,
    formatGbp,
    parseMethodologyText,
  } from './types';

  const {
    bundle,
    focusedLad,
    glossary,
    onMethodologyOpen,
    onClearFocus,
  }: {
    bundle: FlowBundle | null;
    focusedLad: LadData | null;
    glossary: Record<string, string>;
    onMethodologyOpen: () => void;
    onClearFocus: () => void;
  } = $props();

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  }

  // Aggregate either the focused LAD or the whole bundle.
  const view = $derived.by(() => {
    if (!bundle) return null;
    if (focusedLad) {
      return {
        kind: 'lad' as const,
        title: focusedLad.lad_name,
        subtitle:
          `${focusedLad.employee_count.toLocaleString()} employees · ` +
          `£${focusedLad.median_pay_gbp.toLocaleString()}/mo median · ` +
          `${focusedLad.dwellings.toLocaleString()} dwellings`,
        payroll: focusedLad.total_payroll_estimate_gbp,
        flows: (ft: FlowType) => focusedLad.flows[FLOW_AMOUNT_KEY[ft]] as number,
      };
    }
    const lads  = bundle.lads;
    const total = lads.reduce((s, l) => s + l.total_payroll_estimate_gbp, 0);
    const empl  = lads.reduce((s, l) => s + l.employee_count, 0);
    const dwellings = lads.reduce((s, l) => s + l.dwellings, 0);
    const flowSum: Record<FlowType, number> = {
      hmrc: 0, water: 0, energy: 0, council_tax: 0, unaccounted: 0,
    };
    for (const l of lads) {
      flowSum.hmrc        += l.flows.hmrc_gbp;
      flowSum.water       += l.flows.water_gbp;
      flowSum.energy      += l.flows.energy_gbp;
      flowSum.council_tax += l.flows.council_tax_gbp;
      flowSum.unaccounted += l.flows.unaccounted_gbp;
    }
    return {
      kind: 'overall' as const,
      title: 'Kent & Medway',
      subtitle: `${empl.toLocaleString()} employees · ${lads.length} districts · ${dwellings.toLocaleString()} dwellings`,
      payroll: total,
      flows: (ft: FlowType) => flowSum[ft],
    };
  });

  const sourceSegs = $derived(
    bundle ? parseMethodologyText(bundle.source.methodology, glossary).slice(0, 6) : [],
  );
</script>

<aside class="focus-panel">
  {#if bundle && view}
    {@const src = bundle.source}

    <p class="kicker">
      {#if view.kind === 'lad'}
        The district in focus
        <button class="clear-focus" onclick={onClearFocus} title="Clear focus, show county overall">
          clear focus
        </button>
      {:else}
        The county in focus
      {/if}
    </p>

    <h2 class="focus-title">{view.title}</h2>
    <p class="focus-sub">{view.subtitle}</p>

    <div class="big-number">
      <span class="big-amount">{formatGbp(view.payroll)}</span>
      <span class="big-period">payroll this month</span>
    </div>

    <div class="rule"></div>

    <p class="section-kicker">Where it goes</p>

    <div class="breakdown">
      {#each CATEGORY_ORDER as cat}
        {@const color = CATEGORY_COLORS_HEX[cat]}
        {@const flows = FLOWS_BY_CATEGORY[cat]}
        <div class="cat-group">
          <div class="cat-header">
            <span class="cat-dot" style="background:{color};"></span>
            <span class="cat-name" style="color:{color};">{CATEGORY_LABELS[cat]}</span>
          </div>
          <ul class="cat-rows">
            {#each flows as ft}
              {@const meta = bundle.flow_meta[ft]}
              {@const amount = view.flows(ft)}
              {#if meta}
                <li class="cat-row" class:cat-row-zero={amount === 0}>
                  <span
                    class="cat-row-mark"
                    class:mark-measured={meta.confidence === 'measured'}
                    class:mark-estimated={meta.confidence === 'estimated'}
                    class:mark-modelled={meta.confidence === 'modelled'}
                    style="--c:{color};"
                    title={meta.confidence}
                  ></span>
                  <span class="cat-row-label">{meta.label}</span>
                  <span class="cat-row-leader"></span>
                  <span class="cat-row-amount">
                    {amount === 0 ? '—' : formatGbp(amount)}
                  </span>
                </li>
              {/if}
            {/each}
          </ul>
        </div>
      {/each}
    </div>

    <div class="rule"></div>

    <p class="section-kicker">Source</p>
    <p class="src-publisher">{src.publisher}</p>
    <p class="src-methodology">
      {#each sourceSegs as seg}{seg.text}{/each}
    </p>
    <div class="src-meta">
      <span class="src-pill">{src.license}</span>
      <span class="src-fetched">Fetched {formatDate(src.fetched_at)}</span>
      <button class="methodology-link" onclick={onMethodologyOpen}>Methodology &rsaquo;</button>
    </div>
  {/if}
</aside>

<style>
  .focus-panel {
    height: 100%;
    overflow-y: auto;
    padding: 0.75rem 1rem 1rem 1.25rem;
    border-left: 1px solid var(--rule);
    font-family: 'Inter', sans-serif;
    color: var(--ink);
    background: var(--paper);
    display: flex;
    flex-direction: column;
    scrollbar-width: thin;
    scrollbar-color: var(--rule) transparent;
  }

  .kicker,
  .section-kicker {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0 0 0.45rem;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .clear-focus {
    background: none;
    border: none;
    color: var(--ink-mute);
    text-transform: none;
    letter-spacing: 0;
    font-size: 0.6875rem;
    font-style: italic;
    font-family: 'EB Garamond', Georgia, serif;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: var(--rule);
  }

  .clear-focus:hover {
    color: var(--ink);
    text-decoration-color: var(--ink);
  }

  .focus-title {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.5rem, 2.4vw, 2rem);
    line-height: 1.05;
    color: var(--ink);
    letter-spacing: -0.005em;
    margin: 0;
  }

  .focus-sub {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    color: var(--ink-soft);
    font-style: italic;
    margin: 0.3rem 0 0.55rem;
    line-height: 1.35;
  }

  .big-number {
    display: flex;
    align-items: baseline;
    gap: 0.55rem;
    margin: 0.1rem 0 0.5rem;
  }

  .big-amount {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(1.85rem, 2.8vw, 2.2rem);
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  .big-period {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }

  .rule {
    height: 1px;
    background: var(--rule);
    margin: 0.7rem 0 0.6rem;
  }

  .breakdown {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
  }

  .cat-group {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .cat-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding-bottom: 0.1rem;
    border-bottom: 1px dotted var(--rule);
  }

  .cat-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .cat-name {
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .cat-rows {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.18rem;
  }

  .cat-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.9rem;
    color: var(--ink);
    line-height: 1.25;
  }

  .cat-row-zero {
    color: var(--ink-mute);
  }

  .cat-row-mark {
    width: 16px;
    flex-shrink: 0;
    display: inline-flex;
    justify-content: center;
    align-items: center;
  }

  .mark-measured {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c);
  }

  .mark-estimated {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    border: 1.5px solid var(--c);
    background: transparent;
  }

  .mark-modelled {
    height: 2px;
    width: 14px;
    background-image: repeating-linear-gradient(
      to right,
      var(--c) 0 3px,
      transparent 3px 6px
    );
  }

  .cat-row-label {
    flex-shrink: 0;
  }

  .cat-row-leader {
    flex: 1;
    border-bottom: 1px dotted var(--rule);
    align-self: end;
    transform: translateY(-3px);
    min-width: 0.6rem;
  }

  .cat-row-amount {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 0.95rem;
    color: var(--ink);
    letter-spacing: -0.005em;
    flex-shrink: 0;
  }

  .src-publisher {
    font-family: 'Inter', sans-serif;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--ink);
    margin: 0;
    letter-spacing: 0.01em;
  }

  .src-methodology {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    line-height: 1.4;
    color: var(--ink-soft);
    margin: 0.25rem 0 0.55rem;
  }

  .src-meta {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
  }

  .src-pill {
    font-family: 'Inter', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.12rem 0.4rem;
    border: 1px solid var(--ink);
    color: var(--ink);
  }

  .src-fetched {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.78rem;
    color: var(--ink-mute);
  }

  .methodology-link {
    background: none;
    border: none;
    margin-left: auto;
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.85rem;
    color: var(--ink);
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--rule);
  }

  .methodology-link:hover {
    text-decoration-color: var(--ink);
  }
</style>
