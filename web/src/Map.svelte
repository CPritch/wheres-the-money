<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { FlowBundle, FlowType, LadData, LayerToggles } from './types';
  import { FLOW_COLORS_HEX, formatGbp } from './types';
  import { ParticleSystem } from './ParticleSystem';

  const {
    flowBundle,
    resolvedToggles,
    displayAmounts,
    focusedLadCode,
    onFlowSelect,
    onLadClick,
  }: {
    flowBundle: FlowBundle | null;
    resolvedToggles: LayerToggles;
    displayAmounts: Record<FlowType, number> | null;
    focusedLadCode: string | null;
    onFlowSelect?: (type: FlowType) => void;
    onLadClick?: (lad: LadData) => void;
  } = $props();

  const STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
  const KENT_CENTER: [number, number] = [0.75, 51.25];
  const KENT_ZOOM = 9;

  // Target node layout: [flowType, x_fraction, y_fraction] in HTML coords (y=0 at top)
  const TARGET_LAYOUT: [FlowType, number, number][] = [
    ['hmrc',         0.88, 0.16],
    ['water',        0.93, 0.42],
    ['energy',       0.93, 0.66],
    ['council_tax',  0.08, 0.50],
    ['unaccounted',  0.50, 0.92],
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

  let hoveredTarget = $state<FlowType | null>(null);

  $effect(() => {
    if (mapLoaded && flowBundle) {
      applyFocus(flowBundle);
    }
    if (mapLoaded && flowBundle && particleSystem) {
      const centroids = flowBundle.lads.map(
        l => centroidByCode.get(l.lad_code) ?? ([0.75, 51.25] as [number, number])
      );
      particleSystem.setData(flowBundle, map, centroids, getTargetPixels());
    }
  });

  $effect(() => {
    if (particleSystem && flowBundle) {
      particleSystem.updateToggles(resolvedToggles, flowBundle.flow_meta as Record<string, any>);
    }
  });

  // Re-apply focused district styling when selection changes.
  $effect(() => {
    void focusedLadCode;
    if (mapLoaded && flowBundle) applyFocus(flowBundle);
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

  function applyFocus(bundle: FlowBundle) {
    if (!rawGeoJSON || !map.getSource('lad')) return;
    const payrollByCode = new Map(bundle.lads.map(l => [l.lad_code, l.total_payroll_estimate_gbp]));
    const enriched: GeoJSON.FeatureCollection = {
      ...rawGeoJSON,
      features: rawGeoJSON.features.map(f => {
        const code = (f.properties as Record<string, string>)['LAD24CD'];
        return {
          ...f,
          properties: {
            ...f.properties,
            payroll:  payrollByCode.get(code) ?? null,
            focused:  focusedLadCode === code,
          },
        };
      }),
    };
    (map.getSource('lad') as maplibregl.GeoJSONSource).setData(enriched);
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

    map.on('load', () => {
      // Cream-paper tint over the basemap so the design's editorial ground reads as paper.
      // We do this by overriding the basemap's background and dialing back vivid features.
      try {
        map.setPaintProperty('background', 'background-color', '#efe7d2');
      } catch {}

      // Soften any vivid water / road colours from positron toward the paper palette.
      const style = map.getStyle();
      for (const layer of style.layers ?? []) {
        if (layer.type === 'fill' && /water|park|landcover|landuse/i.test(layer.id)) {
          try { map.setPaintProperty(layer.id, 'fill-color', '#e6dcc4'); } catch {}
          try { map.setPaintProperty(layer.id, 'fill-opacity', 0.55); } catch {}
        }
        if (layer.type === 'line' && /road|highway|bridge|tunnel/i.test(layer.id)) {
          try { map.setPaintProperty(layer.id, 'line-color', '#d8cdb1'); } catch {}
          try { map.setPaintProperty(layer.id, 'line-opacity', 0.45); } catch {}
        }
        if (layer.type === 'symbol') {
          try { map.setPaintProperty(layer.id, 'text-color', '#8a7f6a'); } catch {}
          try { map.setPaintProperty(layer.id, 'text-halo-color', '#efe7d2'); } catch {}
        }
      }

      map.addSource('lad', { type: 'geojson', data: rawGeoJSON!, generateId: true });

      map.addLayer({
        id: 'lad-fill',
        type: 'fill',
        source: 'lad',
        paint: {
          'fill-color': [
            'case',
            ['boolean', ['get', 'focused'], false],
            '#d8c69e',
            '#e6dcc1',
          ],
          'fill-opacity': [
            'case',
            ['boolean', ['get', 'focused'], false], 0.55,
            ['boolean', ['feature-state', 'hover'], false], 0.40,
            0.10,
          ],
        },
      });

      map.addLayer({
        id: 'lad-outline',
        type: 'line',
        source: 'lad',
        paint: {
          'line-color': '#1a1815',
          'line-width': [
            'case',
            ['boolean', ['get', 'focused'], false], 2.0,
            ['boolean', ['feature-state', 'hover'], false], 1.4,
            0.9,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['get', 'focused'], false], 0.95,
            ['boolean', ['feature-state', 'hover'], false], 0.85,
            0.55,
          ],
        },
      });

      // LAD name labels (small italic serif, à la editorial map captions).
      map.addLayer({
        id: 'lad-label',
        type: 'symbol',
        source: 'lad',
        layout: {
          'text-field': ['get', 'LAD24NM'],
          'text-font': ['Open Sans Italic', 'Arial Unicode MS Italic'],
          'text-size': 10,
          'text-letter-spacing': 0.05,
          'text-transform': 'uppercase',
          'text-allow-overlap': false,
          'text-padding': 2,
        },
        paint: {
          'text-color': '#5b5346',
          'text-halo-color': '#efe7d2',
          'text-halo-width': 1.5,
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
      {@const amount = displayAmounts ? displayAmounts[type] : 0}
      {@const color = FLOW_COLORS_HEX[type]}
      {@const dimmed = amount === 0}
      <button
        class="target-node"
        class:target-right={fx > 0.5}
        class:target-left={fx < 0.5}
        class:target-center={fx === 0.50}
        class:target-hovered={hoveredTarget === type}
        class:target-dimmed={dimmed}
        style="left: {fx * 100}%; top: {fy * 100}%; --c: {color};"
        onclick={() => onFlowSelect?.(type)}
        onmouseenter={() => hoveredTarget = type}
        onmouseleave={() => hoveredTarget = null}
        aria-label="Explore {meta?.label ?? type} flow details"
      >
        <span class="target-mark"
          class:mark-measured={meta?.confidence === 'measured'}
          class:mark-estimated={meta?.confidence === 'estimated'}
          class:mark-modelled={meta?.confidence === 'modelled'}
        ></span>
        <div class="target-body">
          <span class="target-label">{meta?.label ?? type}</span>
          <span class="target-amount">
            {dimmed ? '—' : formatGbp(amount)}<span class="target-period">{dimmed ? '' : '/mo'}</span>
          </span>
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
    background: var(--paper);
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
    padding: 0.3rem 0.45rem;
    border-radius: 2px;
    transition: background 0.15s;
  }

  .target-node:hover,
  .target-node.target-hovered {
    background: rgba(26, 24, 21, 0.06);
  }

  .target-dimmed {
    opacity: 0.3;
    pointer-events: none;
  }

  /* Right-side nodes: mark on right, text on left */
  .target-right {
    flex-direction: row-reverse;
  }

  /* Left-side and center nodes: mark on left, text on right */
  .target-left,
  .target-center {
    flex-direction: row;
  }

  /* Confidence-by-shape marks (Rule II from System reference) */
  .target-mark {
    width: 9px;
    height: 9px;
    flex-shrink: 0;
    display: inline-block;
    position: relative;
  }
  .mark-measured {
    background: var(--c);
    border-radius: 50%;
  }
  .mark-estimated {
    background: transparent;
    border: 1.5px solid var(--c);
    border-radius: 50%;
  }
  .mark-modelled {
    background: transparent;
    height: 2px;
    width: 12px;
    align-self: center;
    background-image: repeating-linear-gradient(
      to right,
      var(--c) 0 3px,
      transparent 3px 6px
    );
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
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--c);
    line-height: 1.1;
  }

  .target-amount {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.05rem;
    font-weight: 500;
    color: var(--ink);
    letter-spacing: -0.01em;
    line-height: 1.05;
  }

  .target-period {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 400;
    color: var(--ink-mute);
    margin-left: 0.15rem;
    letter-spacing: 0.02em;
  }

  /* ── Tooltip ── */
  .tooltip {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    background: var(--paper);
    border: 1px solid var(--ink);
    color: var(--ink);
    padding: 0.4rem 0.7rem;
    font-size: 0.75rem;
    white-space: nowrap;
    letter-spacing: 0.01em;
    will-change: transform;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    box-shadow: 1px 1px 0 var(--ink);
  }

  .tooltip-name {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 0.95rem;
  }

  .target-center {
    transform: translate(-50%, -50%);
  }

  .tooltip-payroll {
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }

  :global(.maplibregl-ctrl-attrib) {
    background: rgba(239, 231, 210, 0.85) !important;
    color: #7d735e !important;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.625rem;
  }

  :global(.maplibregl-ctrl-attrib a) {
    color: #5b5346 !important;
  }
</style>
