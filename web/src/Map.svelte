<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { FlowBundle } from './types';
  import { ParticleSystem } from './ParticleSystem';

  const { flowBundle }: { flowBundle: FlowBundle | null } = $props();

  const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const KENT_CENTER: [number, number] = [0.75, 51.25];
  const KENT_ZOOM = 9;

  const PAY_MIN = 100_000_000;
  const PAY_MAX = 355_000_000;

  let mapContainer: HTMLDivElement;
  let particleCanvas: HTMLCanvasElement;
  let map: maplibregl.Map;
  let particleSystem = $state<ParticleSystem | null>(null);
  let mapLoaded = $state(false);
  let rawGeoJSON: GeoJSON.FeatureCollection | null = null;
  const centroidByCode = new Map<string, [number, number]>();

  let tooltip = $state({ visible: false, x: 0, y: 0, name: '', payroll: '' });
  let hoveredId: number | string | null = null;

  // Hoisted refs for cleanup
  let _ps: ParticleSystem | null = null;
  let _resizeObs: ResizeObserver | null = null;

  $effect(() => {
    if (mapLoaded && flowBundle) {
      applyChoropleth(flowBundle);
    }
    if (mapLoaded && flowBundle && particleSystem) {
      const centroids = flowBundle.lads.map(
        l => centroidByCode.get(l.lad_code) ?? ([0.75, 51.25] as [number, number])
      );
      particleSystem.setData(flowBundle, map, centroids);
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
        map.getCanvas().style.cursor = 'crosshair';
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

      mapLoaded = true;
    });

    _ps = new ParticleSystem(particleCanvas);
    await _ps.init();
    particleSystem = _ps;

    _resizeObs = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        _ps?.resize(Math.round(width), Math.round(height));
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

  .tooltip-payroll {
    font-size: 0.75rem;
    font-weight: 400;
    color: rgba(124, 131, 255, 0.9);
  }
</style>
