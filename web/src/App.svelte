<script lang="ts">
  import { onMount } from 'svelte';
  import Map from './Map.svelte';
  import Masthead from './Masthead.svelte';
  import CategoryStrip from './CategoryStrip.svelte';
  import HowToRead from './HowToRead.svelte';
  import FocusPanel from './FocusPanel.svelte';
  import FlowPanel from './FlowPanel.svelte';
  import FooterBar from './FooterBar.svelte';
  import MethodologyDrawer from './MethodologyDrawer.svelte';
  import type {
    Category,
    FlowBundle,
    FlowType,
    LadData,
    LayerToggles,
    LayerToggleState,
    PanelSelection,
  } from './types';
  import {
    DEFAULT_TOGGLES,
    FLOWS_BY_CATEGORY,
    resolveEffectiveToggles,
    computeDisplayAmounts,
    computeCategoryAmounts,
  } from './types';

  const buildDate = new Date(__BUILD_DATE__).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  let flowBundle = $state<FlowBundle | null>(null);
  let glossary = $state<Record<string, string>>({});
  let panelSelection = $state<PanelSelection>(null);
  let focusedLad = $state<LadData | null>(null);
  let methodologyOpen = $state(false);

  let layerToggles = $state<LayerToggles>({ ...DEFAULT_TOGGLES });
  let rawOnly = $state(false);

  const resolvedToggles = $derived(
    flowBundle
      ? resolveEffectiveToggles(layerToggles, rawOnly, flowBundle.flow_meta as any)
      : ({ ...DEFAULT_TOGGLES } as LayerToggles)
  );

  const displayAmounts = $derived(
    flowBundle ? computeDisplayAmounts(flowBundle, resolvedToggles) : null
  );

  const categoryAmounts = $derived(
    displayAmounts ? computeCategoryAmounts(displayAmounts) : null
  );

  const totalPayroll = $derived(
    flowBundle ? flowBundle.lads.reduce((s, l) => s + l.total_payroll_estimate_gbp, 0) : 0
  );

  const periodLabel = $derived(
    flowBundle
      ? new Date(flowBundle.period_start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      : ''
  );

  onMount(async () => {
    const [flowRes, glossaryRes] = await Promise.all([
      fetch('/data/flows/2025-10.json'),
      fetch('/data/glossary.json'),
    ]);
    flowBundle = await flowRes.json();
    glossary = await glossaryRes.json();
  });

  function handleFlowSelect(type: FlowType) {
    panelSelection = { kind: 'flow', type };
  }

  function handleLadClick(lad: LadData) {
    focusedLad = lad;
    // Don't open the floating flow panel for LAD clicks — focus panel handles it
    panelSelection = null;
  }

  function handlePanelClose() {
    panelSelection = null;
  }

  function handleClearFocus() {
    focusedLad = null;
  }

  function handleCategoryToggle(cat: Category, newState: LayerToggleState) {
    const next = { ...layerToggles };
    for (const ft of FLOWS_BY_CATEGORY[cat]) next[ft] = newState;
    layerToggles = next;
  }

  function handleRawOnlyChange(v: boolean) {
    rawOnly = v;
  }
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === 'Escape') {
    methodologyOpen = false;
    panelSelection = null;
    focusedLad = null;
  }
}} />

<div class="app">
  <Masthead
    totalPayroll={totalPayroll}
    districtCount={flowBundle?.lads.length ?? 0}
    periodLabel={periodLabel}
  />

  <CategoryStrip
    categoryAmounts={categoryAmounts ?? { statutory: 0, utilities: 0, unaccounted: 0 }}
    totalPayroll={totalPayroll}
    layerToggles={layerToggles}
    rawOnly={rawOnly}
    onCategoryToggle={handleCategoryToggle}
    onRawOnlyChange={handleRawOnlyChange}
  />

  <main class="main-grid">
    <div class="left-rail">
      <HowToRead />
    </div>

    <div class="map-area">
      <Map
        flowBundle={flowBundle}
        resolvedToggles={resolvedToggles}
        displayAmounts={displayAmounts}
        focusedLadCode={focusedLad?.lad_code ?? null}
        onFlowSelect={handleFlowSelect}
        onLadClick={handleLadClick}
      />
      <p class="map-caption">
        <span class="fig-tag">Fig. 1</span>
        <em>
          {#if focusedLad}
            {focusedLad.lad_name}, in focus. Each particle is one slice of one flow.
          {:else}
            Kent &amp; Medway, all districts. Each particle is one slice of one flow — click a district to focus.
          {/if}
        </em>
      </p>
    </div>

    <div class="right-rail">
      <FocusPanel
        bundle={flowBundle}
        focusedLad={focusedLad}
        glossary={glossary}
        onMethodologyOpen={() => methodologyOpen = true}
        onClearFocus={handleClearFocus}
      />
    </div>
  </main>

  <FooterBar
    period={periodLabel}
    deployedDate={buildDate}
    onMethodologyOpen={() => methodologyOpen = true}
  />

  <FlowPanel
    selection={panelSelection}
    flowBundle={flowBundle}
    glossary={glossary}
    onClose={handlePanelClose}
  />

  <MethodologyDrawer
    open={methodologyOpen}
    flowBundle={flowBundle}
    glossary={glossary}
    onClose={() => methodologyOpen = false}
  />
</div>

<style>
  :global(:root) {
    /* ── Design tokens (canonical layout) ──────────────────────── */
    /* Paper ground — warm cream */
    --paper:       #efe7d2;
    --paper-deep:  #e6dcc1;
    --paper-soft:  #f4ecd9;

    /* Ink — warm near-black */
    --ink:         #1a1815;
    --ink-soft:    #3d3a32;
    --ink-mute:    #7d735e;

    /* Editorial rule */
    --rule:        rgba(26, 24, 21, 0.18);
    --rule-strong: rgba(26, 24, 21, 0.42);

    /* Category palette */
    --statutory:   #A23D2E;
    --utilities:   #234F66;
    --unaccounted: #6B6358;

    /* Confidence accent — used in pills */
    --confidence-measured:  #2f6a3f;
    --confidence-estimated: #8a5a18;
    --confidence-modelled:  #5a3aa8;
  }

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
    background: var(--paper);
    font-family: 'Inter', system-ui, sans-serif;
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  .app {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-rows: auto auto 1fr auto;
    background: var(--paper);
  }

  .main-grid {
    display: grid;
    grid-template-columns: 12.5rem 1fr 21rem;
    min-height: 0;       /* allow children to size from grid track */
    position: relative;
  }

  .left-rail {
    padding: 0.4rem 1rem 0.5rem 1.5rem;
    overflow-x: hidden;
    overflow-y: auto;
    min-width: 0;
    border-right: 1px solid var(--rule);
  }

  .map-area {
    position: relative;
    min-width: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: 1fr auto;
  }

  .map-caption {
    padding: 0.4rem 1.25rem 0.5rem;
    border-top: 1px solid var(--rule);
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.78rem;
    color: var(--ink-mute);
    line-height: 1.4;
    background: var(--paper);
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
  }

  .fig-tag {
    font-family: 'Inter', sans-serif;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    flex-shrink: 0;
  }

  .map-caption em {
    font-style: italic;
  }

  .right-rail {
    overflow: hidden;
    min-width: 0;
  }

  /* MapLibre control overrides for the paper aesthetic */
  :global(.maplibregl-ctrl-attrib-button) {
    background-color: var(--paper-soft) !important;
  }
</style>
