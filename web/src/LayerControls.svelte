<script lang="ts">
  import type { FlowBundle, FlowType, LayerToggles, LayerToggleState } from './types';
  import { FLOW_TYPES, FLOW_COLORS_HEX, LAYER_HAS_MODELLING } from './types';

  const {
    flowBundle,
    layerToggles,
    rawOnly,
    resolvedToggles,
    displayAmounts,
    onToggleChange,
    onRawOnlyChange,
  }: {
    flowBundle: FlowBundle | null;
    layerToggles: LayerToggles;
    rawOnly: boolean;
    resolvedToggles: LayerToggles;
    displayAmounts: Record<FlowType, number> | null;
    onToggleChange: (type: FlowType, state: LayerToggleState) => void;
    onRawOnlyChange: (v: boolean) => void;
  } = $props();

  function formatGbp(n: number): string {
    if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
    return `£${(n / 1_000_000).toFixed(0)}m`;
  }

  function cycleToggle(type: FlowType) {
    const current = layerToggles[type];
    const hasModelling = LAYER_HAS_MODELLING[type];
    let next: LayerToggleState;
    if (!hasModelling) {
      next = current === 'on' ? 'off' : 'on';
    } else {
      // Tri-state cycle: on → raw_only → off → on
      if (current === 'on') next = 'raw_only';
      else if (current === 'raw_only') next = 'off';
      else next = 'on';
    }
    onToggleChange(type, next);
  }
</script>

<aside class="layer-controls">
  <div class="lc-header">
    <span class="lc-title">Layers</span>
  </div>

  <div class="master-row">
    <span class="master-label">Raw data only</span>
    <button
      class="raw-toggle"
      class:raw-toggle-on={rawOnly}
      onclick={() => onRawOnlyChange(!rawOnly)}
      title="Show only directly measured data; hides all modelled and estimated flows"
    >
      {rawOnly ? 'ON' : 'OFF'}
    </button>
  </div>

  <div class="lc-divider"></div>

  {#if flowBundle}
    {#each FLOW_TYPES as type}
      {@const meta = flowBundle.flow_meta[type]}
      {@const color = FLOW_COLORS_HEX[type]}
      {@const hasModelling = LAYER_HAS_MODELLING[type]}
      {@const effective = resolvedToggles[type]}
      {@const amount = displayAmounts?.[type] ?? 0}
      {@const rawOverridden = rawOnly && hasModelling && layerToggles[type] !== 'off'}

      <div class="layer-row" class:layer-row-off={effective === 'off' || (effective === 'raw_only' && hasModelling)}>
        <span class="layer-dot" style="background:{color};box-shadow:0 0 5px 2px {color};"></span>
        <span class="layer-name">{meta?.label ?? type}</span>
        <span class="layer-amount">{amount === 0 ? '—' : formatGbp(amount)}</span>

        <div class="toggle-group" role="group" aria-label="{meta?.label ?? type} visibility">
          <button
            class="tg-btn"
            class:tg-active={effective === 'off'}
            onclick={() => onToggleChange(type, 'off')}
            title="Hide this flow"
          >off</button>

          {#if hasModelling}
            <button
              class="tg-btn tg-raw"
              class:tg-active={effective === 'raw_only'}
              class:tg-locked={rawOverridden}
              onclick={() => onToggleChange(type, 'raw_only')}
              title="Show raw/measured data only (no modelled component)"
            >raw</button>
          {/if}

          <button
            class="tg-btn tg-on"
            class:tg-active={effective === 'on'}
            class:tg-btn-disabled={rawOverridden}
            style="--c:{color}"
            onclick={() => { if (!rawOverridden) onToggleChange(type, 'on'); }}
            title={rawOverridden ? 'Disabled by Raw data only switch' : 'Show full flow including modelled data'}
          >{hasModelling ? 'all' : 'on'}</button>
        </div>
      </div>
    {/each}
  {/if}
</aside>

<style>
  .layer-controls {
    position: absolute;
    bottom: 3rem;
    left: 1.25rem;
    width: 15.5rem;
    background: rgba(8, 8, 20, 0.88);
    border: 1px solid rgba(124, 131, 255, 0.18);
    border-radius: 7px;
    padding: 0.6rem 0.75rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    backdrop-filter: blur(10px);
    font-size: 0.6875rem;
    color: #a0a0b8;
    z-index: 9;
    user-select: none;
  }

  .lc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.1rem;
  }

  .lc-title {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #404055;
  }

  .lc-divider {
    height: 1px;
    background: rgba(124, 131, 255, 0.1);
    margin: 0.1rem 0;
  }

  /* Master "raw data only" row */
  .master-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.1rem 0;
  }

  .master-label {
    font-size: 0.6875rem;
    font-weight: 500;
    color: #8a8aa8;
  }

  .raw-toggle {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(124, 131, 255, 0.22);
    color: #505068;
    font-size: 0.5625rem;
    font-weight: 700;
    font-family: inherit;
    letter-spacing: 0.08em;
    cursor: pointer;
    padding: 0.18rem 0.5rem;
    border-radius: 3px;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }

  .raw-toggle:hover {
    background: rgba(124, 131, 255, 0.1);
    color: #a0a0b8;
    border-color: rgba(124, 131, 255, 0.38);
  }

  .raw-toggle-on {
    background: rgba(124, 131, 255, 0.18);
    border-color: rgba(124, 131, 255, 0.55);
    color: #9aa0ff;
  }

  .raw-toggle-on:hover {
    background: rgba(124, 131, 255, 0.24);
    color: #b0b6ff;
  }

  /* Per-layer rows */
  .layer-row {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.15rem 0;
    transition: opacity 0.2s;
  }

  .layer-row-off {
    opacity: 0.45;
  }

  .layer-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .layer-name {
    flex: 1;
    font-size: 0.6875rem;
    font-weight: 500;
    color: #c0c0d8;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .layer-amount {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #6a6a88;
    min-width: 2.8rem;
    text-align: right;
    letter-spacing: -0.01em;
    flex-shrink: 0;
  }

  /* Toggle button group */
  .toggle-group {
    display: flex;
    gap: 1px;
    flex-shrink: 0;
  }

  .tg-btn {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(124, 131, 255, 0.15);
    color: #404055;
    font-size: 0.5rem;
    font-weight: 700;
    font-family: inherit;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    padding: 0.15rem 0.3rem;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    border-radius: 0;
    line-height: 1;
  }

  .tg-btn:first-child { border-radius: 2px 0 0 2px; }
  .tg-btn:last-child  { border-radius: 0 2px 2px 0; }
  .tg-btn:only-child  { border-radius: 2px; }

  .tg-btn:hover:not(.tg-btn-disabled) {
    background: rgba(124, 131, 255, 0.1);
    color: #8a8aa8;
    border-color: rgba(124, 131, 255, 0.3);
  }

  .tg-active {
    background: rgba(80, 80, 120, 0.35);
    border-color: rgba(124, 131, 255, 0.35);
    color: #7c83ff;
  }

  .tg-on.tg-active {
    background: color-mix(in srgb, var(--c) 22%, transparent);
    border-color: color-mix(in srgb, var(--c) 55%, transparent);
    color: var(--c);
  }

  .tg-raw.tg-active {
    background: rgba(240, 160, 48, 0.14);
    border-color: rgba(240, 160, 48, 0.38);
    color: #f0a030;
  }

  .tg-locked {
    background: rgba(240, 160, 48, 0.1);
    border-color: rgba(240, 160, 48, 0.25);
    color: #c08020;
  }

  .tg-btn-disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
