<script lang="ts">
  import type { Category, FlowType, LayerToggles, LayerToggleState } from './types';
  import {
    CATEGORY_ORDER,
    CATEGORY_LABELS,
    CATEGORY_COLORS_HEX,
    FLOWS_BY_CATEGORY,
    formatGbp,
  } from './types';

  const {
    categoryAmounts,
    totalPayroll,
    layerToggles,
    rawOnly,
    onCategoryToggle,
    onRawOnlyChange,
  }: {
    categoryAmounts: Record<Category, number>;
    totalPayroll: number;
    layerToggles: LayerToggles;
    rawOnly: boolean;
    onCategoryToggle: (cat: Category, newState: LayerToggleState) => void;
    onRawOnlyChange: (v: boolean) => void;
  } = $props();

  function pct(n: number): string {
    if (!totalPayroll) return '—';
    return `${Math.round((n / totalPayroll) * 100)}%`;
  }

  function categoryActive(cat: Category): boolean {
    return FLOWS_BY_CATEGORY[cat].some(
      (ft: FlowType) => layerToggles[ft] !== 'off',
    );
  }

  function handleClick(cat: Category) {
    const newState: LayerToggleState = categoryActive(cat) ? 'off' : 'on';
    onCategoryToggle(cat, newState);
  }
</script>

<nav class="category-strip" aria-label="Flow categories">
  <span class="strip-label">By category</span>

  <div class="chips">
    {#each CATEGORY_ORDER as cat}
      {@const active = categoryActive(cat)}
      {@const amount = categoryAmounts[cat] ?? 0}
      {@const color  = CATEGORY_COLORS_HEX[cat]}
      <button
        class="chip"
        class:chip-active={active}
        style="--c:{color};"
        onclick={() => handleClick(cat)}
        title={active ? `Hide ${CATEGORY_LABELS[cat]}` : `Show ${CATEGORY_LABELS[cat]}`}
      >
        <span class="chip-dot"></span>
        <span class="chip-name">{CATEGORY_LABELS[cat]}</span>
        <span class="chip-amount">{formatGbp(amount)}</span>
        <span class="chip-pct">{pct(amount)}</span>
      </button>
    {/each}
  </div>

  <div class="focus-mode">
    <span class="focus-label">Focus mode</span>
    <button
      class="focus-toggle"
      class:focus-toggle-on={rawOnly}
      onclick={() => onRawOnlyChange(!rawOnly)}
      title="Focus on raw, directly-measured flows only — modelled and estimated flows fade away"
    >
      {rawOnly ? 'ON' : 'OFF'}
    </button>
  </div>
</nav>

<style>
  .category-strip {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.55rem 1.75rem;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    color: var(--ink-mute);
  }

  .strip-label {
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .chips {
    display: flex;
    align-items: center;
    gap: 1.25rem;
    flex: 1;
    flex-wrap: wrap;
  }

  .chip {
    display: flex;
    align-items: baseline;
    gap: 0.45rem;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.15rem 0.05rem;
    font-family: inherit;
    color: inherit;
    border-bottom: 1px dotted transparent;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .chip:not(.chip-active) {
    opacity: 0.45;
  }

  .chip:hover {
    border-bottom-color: var(--ink-mute);
  }

  .chip-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    align-self: center;
    flex-shrink: 0;
  }

  .chip-name {
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--c);
    font-size: 0.6875rem;
  }

  .chip-amount {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 0.95rem;
    color: var(--ink);
    letter-spacing: -0.005em;
  }

  .chip-pct {
    font-family: 'Inter', sans-serif;
    font-weight: 500;
    font-size: 0.6875rem;
    color: var(--ink-mute);
    letter-spacing: 0.04em;
  }

  .focus-mode {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .focus-label {
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }

  .focus-toggle {
    background: var(--paper);
    border: 1px solid var(--ink);
    color: var(--ink);
    font-family: inherit;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    cursor: pointer;
    padding: 0.18rem 0.6rem;
    transition: background 0.15s, color 0.15s;
  }

  .focus-toggle:hover {
    background: var(--ink);
    color: var(--paper);
  }

  .focus-toggle-on {
    background: var(--ink);
    color: var(--paper);
  }
</style>
