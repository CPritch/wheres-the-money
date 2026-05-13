<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { FlowBundle, FlowType, LadData } from './types';
  import { FLOW_COLORS_HEX, FLOW_AMOUNT_KEY } from './types';
  import { ParticleSystem } from './ParticleSystem';

  const { flowBundle, onFlowSelect, onLadClick }: {
    flowBundle: FlowBundle | null;
    onFlowSelect?: (type: FlowType) => void;
    onLadClick?: (lad: LadData) => void;
  } = $props();

  const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const KENT_CENTER: [number, number] = [0.75, 51.25];
  const KENT_ZOOM = 9;

  const PAY_MIN = 100_000_000;
  const PAY_MAX = 355_000_000;

  // Target node layout: [flowType, x_fraction, y_fraction] in HTML coords (y=0 at top)
  // Three destinations stack on the right, council tax on the left, unaccounted at bottom.
  const TARGET_LAYOUT: [FlowType, number, number][] = [
    ['hmrc',         0.87, 0.13],
    ['water',        0.92, 0.37],
    ['energy',       0.92, 0.61],
    ['council_tax',  0.08, 0.47],
    ['unaccounted',  0.50, 0.90],
  ];

  let mapContainer: HTMLDivElement;
  let particleCanvas: HTMLCanvasElement;
  let map: maplibregl.Map;
  let particleSystem = $state<ParticleSystem | null>(null);
  let mapLoaded = $state(false);
  let rawGeoJSON: GeoJSON.FeatureCollection | null = null;
  const centroidByCode = new Map<string, [number, number]>();

  let tooltip = $state({ visible: false, x: 0, y: 0, name: '', payroll: '' });
  let hoveredId: number | string | null = null;

  let _ps: ParticleSystem | null = null;
  let _resizeObs: ResizeObserver | null = null;

  function getTargetPixels(): [number, number][] {
    const w = mapContainer?.clientWidth  ?? window.innerWidth;
    const h = mapContainer?.clientHeight ?? window.innerHeight;
    return TARGET_LAYOUT.map(([, fx, fy]) => [fx * w, fy * h]);
  }

  function flowTotal(bundle: FlowBundle, key: keyof FlowBundle['lads'][0]['flows']): number {
    return bundle.lads.reduce((s, l) => s + (l.flows[key] as number), 0);
  }

  let hoveredTarget = $state<FlowType | null>(null);

  $effect(() => {
    if (mapLoaded && flowBundle) {
      applyChoropleth(flowBundle);
    }
    if (mapLoaded && flowBundle && particleSystem) {
      const centroids = flowBundle.lads.map(
        l => centroidByCode.get(l.lad_code) ?? ([0.75, 51.25] as [number, number])
      );
      particleSystem.setData(flowBundle, map, centroids, getTargetPixels());
    }
  });

  function computeCentroid(feature: GeoJSON.Feature): [number, number] {
    const geom = feature.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
    let ring: number[][];
    if (geom.type === 'MultiPolygon') {
      ring = geom.coordinates.reduce(
        (best, poly) => poly[0].length > best.length ? poly[0] : best,
        geom.coordinates[0][0]
      );
    } else {
      ring = geom.coordinates[0];
    }
    let sumLon = 0, sumLat = 0;
    for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
    return [sumLon / ring.length, sumLat / ring.length];
  }

  function formatGbp(n: number): string {
    if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(1)}bn`;
    return `£${(n / 1_000_000).toFixed(0)}m`;
  }

  function applyChoropleth(bundle: FlowBundle) {
    if (!rawGeoJSON || !map.getSource('lad')) return;
    const payrollByCode = new Map(bundle.lads.map(l => [l.lad_code, l.total_payroll_estimate_gbp]));
    const enriched: GeoJSON.FeatureCollection = {
      ...rawGeoJSON,
      features: rawGeoJSON.features.map(f => ({
        ...f,
        properties: {
          ...f.properties,
          payroll: payrollByCode.get((f.properties as Record<string, string>)['LAD24CD']) ?? null,
        },
      })),
    };
    (map.getSource('lad') as maplibregl.GeoJSONSource).setData(enriched);
    map.setPaintProperty('lad-fill', 'fill-color', [
      'case',
      ['!=', ['get', 'payroll'], null],
      ['interpolate', ['linear'], ['get', 'payroll'],
        PAY_MIN, '#0e1042',
        (PAY_MIN + PAY_MAX) / 2, '#3d45c0',
        PAY_MAX, '#7c83ff',
      ],
      '#0e1042',
    ]);
    map.setPaintProperty('lad-fill', 'fill-opacity', [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      0.82,
      0.45,
    ]);
  }

  onMount(async () => {
    const geoRes = await fetch('/data/kent_medway_lad_boundaries.geojson');
    rawGeoJSON = await geoRes.json();

    for (const feature of rawGeoJSON!.features) {
      const code = (feature.properties as Record<string, string>)['LAD24CD'];
      centroidByCode.set(code, computeCentroid(feature));
    }

    map = new maplibregl.Map({
      container: mapContainer,
      style: STYLE_URL,
      center: KENT_CENTER,
      zoom: KENT_ZOOM,
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
    });

    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('lad', { type: 'geojson', data: rawGeoJSON!, generateId: true });

      map.addLayer({
        id: 'lad-fill',
        type: 'fill',
        source: 'lad',
        paint: {
          'fill-color': '#7c83ff',
          'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.18, 0.05],
        },
      });

      map.addLayer({
        id: 'lad-outline',
        type: 'line',
        source: 'lad',
        paint: {
          'line-color': '#7c83ff',
          'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.8, 0.7],
          'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.45],
        },
      });

      map.on('mousemove', 'lad-fill', (e) => {
        if (!e.features?.length) return;
        map.getCanvas().style.cursor = 'pointer';
        const feature = e.features[0];
        const id = feature.id as number | string | undefined;
        if (hoveredId !== null && hoveredId !== id) {
          map.setFeatureState({ source: 'lad', id: hoveredId }, { hover: false });
        }
        hoveredId = id ?? null;
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'lad', id: hoveredId }, { hover: true });
        }
        const props = feature.properties as Record<string, string | number>;
        const payroll = props['payroll'];
        tooltip = {
          visible: true, x: e.point.x, y: e.point.y,
          name: (props['LAD24NM'] as string) ?? '',
          payroll: typeof payroll === 'number' ? formatGbp(payroll) : '',
        };
      });

      map.on('mouseleave', 'lad-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'lad', id: hoveredId }, { hover: false });
          hoveredId = null;
        }
        tooltip = { ...tooltip, visible: false };
      });

      map.on('click', 'lad-fill', (e) => {
        if (!e.features?.length || !flowBundle) return;
        const props = e.features[0].properties as Record<string, string>;
        const lad = flowBundle.lads.find(l => l.lad_code === props['LAD24CD']);
        if (lad) onLadClick?.(lad);
      });

      mapLoaded = true;
    });

    _ps = new ParticleSystem(particleCanvas);
    await _ps.init();
    particleSystem = _ps;

    _resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const w = Math.round(width);
        const h = Math.round(height);
        _ps?.resize(w, h);
        _ps?.updateTargetPositions(TARGET_LAYOUT.map(([, fx, fy]) => [fx * w, fy * h]));
      }
    });
    _resizeObs.observe(mapContainer);
  });

  onDestroy(() => {
    _resizeObs?.disconnect();
    _ps?.dispose();
    map?.remove();
  });
</script>

<div class="map-wrap">
  <div bind:this={mapContainer} class="map"></div>
  <canvas bind:this={particleCanvas} class="particle-layer"></canvas>

  <!-- Flow target nodes -->
  {#if flowBundle}
    {#each TARGET_LAYOUT as [type, fx, fy]}
      {@const meta = flowBundle.flow_meta[type]}
      {@const amount = flowTotal(flowBundle, FLOW_AMOUNT_KEY[type])}
      {@const color = FLOW_COLORS_HEX[type]}
      <button
        class="target-node"
        class:target-right={fx > 0.5}
        class:target-left={fx < 0.5}
        class:target-center={fx === 0.50}
        class:target-hovered={hoveredTarget === type}
        style="left: {fx * 100}%; top: {fy * 100}%; --c: {color};"
        onclick={() => onFlowSelect?.(type)}
        onmouseenter={() => hoveredTarget = type}
        onmouseleave={() => hoveredTarget = null}
        aria-label="Explore {meta?.label ?? type} flow details"
      >
        <div class="target-dot"></div>
        <div class="target-body">
          <span class="target-label">{meta?.label ?? type}</span>
          <span class="target-amount">{formatGbp(amount)}<span class="target-period">/mo</span></span>
        </div>
      </button>
    {/each}
  {/if}

  {#if tooltip.visible}
    <div
      class="tooltip"
      style="transform: translate({tooltip.x + 14}px, {tooltip.y - 52}px)"
    >
      <span class="tooltip-name">{tooltip.name}</span>
      {#if tooltip.payroll}
        <span class="tooltip-payroll">{tooltip.payroll} payroll</span>
      {/if}
    </div>
  {/if}
</div>

<style>
  .map-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .map {
    width: 100%;
    height: 100%;
  }

  .particle-layer {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  /* ── Target nodes ── */
  .target-node {
    position: absolute;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    pointer-events: all;
    user-select: none;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0.3rem;
    border-radius: 4px;
    transition: background 0.15s;
  }

  .target-node:hover,
  .target-node.target-hovered {
    background: rgba(124, 131, 255, 0.06);
  }

  /* Right-side nodes: dot on right, text on left */
  .target-right {
    flex-direction: row-reverse;
  }

  /* Left-side and center nodes: dot on left, text on right */
  .target-left,
  .target-center {
    flex-direction: row;
  }

  .target-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c);
    box-shadow: 0 0 8px 3px var(--c);
    flex-shrink: 0;
  }

  .target-body {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
  }

  .target-right .target-body {
    align-items: flex-end;
  }

  .target-left .target-body,
  .target-center .target-body {
    align-items: flex-start;
  }

  .target-label {
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--c);
    opacity: 0.9;
    line-height: 1.1;
  }

  .target-amount {
    font-size: 0.875rem;
    font-weight: 700;
    color: #e8e8f0;
    letter-spacing: -0.01em;
    line-height: 1.1;
  }

  .target-period {
    font-size: 0.6875rem;
    font-weight: 400;
    color: #505068;
    margin-left: 0.1rem;
  }

  /* ── Tooltip ── */
  .tooltip {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    background: rgba(8, 8, 18, 0.92);
    border: 1px solid rgba(124, 131, 255, 0.45);
    color: #e8e8f0;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    white-space: nowrap;
    backdrop-filter: blur(6px);
    letter-spacing: 0.01em;
    will-change: transform;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .tooltip-name {
    font-weight: 600;
  }

  .target-center {
    transform: translate(-50%, -50%);
  }

  .tooltip-payroll {
    font-size: 0.75rem;
    font-weight: 400;
    color: rgba(124, 131, 255, 0.9);
  }
</style>
