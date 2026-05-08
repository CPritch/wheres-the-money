<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';
  import type { FlowBundle } from './types';

  const { flowBundle }: { flowBundle: FlowBundle | null } = $props();

  const STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
  const KENT_CENTER: [number, number] = [0.75, 51.25];
  const KENT_ZOOM = 9;

  // Payroll range for colour scale (£, approximate Oct 2025 Kent+Medway min/max)
  const PAY_MIN = 100_000_000;
  const PAY_MAX = 355_000_000;

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map;
  let mapLoaded = $state(false);
  let rawGeoJSON: GeoJSON.FeatureCollection | null = null;

  let tooltip = $state({ visible: false, x: 0, y: 0, name: '', payroll: '' });
  let hoveredId: number | string | null = null;

  // Apply choropleth whenever both map and data are ready
  $effect(() => {
    if (mapLoaded && flowBundle) {
      applyChoropleth(flowBundle);
    }
  });

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

    // Gradient: dark indigo at low payroll → bright accent at high
    map.setPaintProperty('lad-fill', 'fill-color', [
      'case',
      ['!=', ['get', 'payroll'], null],
      [
        'interpolate', ['linear'], ['get', 'payroll'],
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
      0.58,
    ]);
  }

  onMount(async () => {
    const geoRes = await fetch('/data/kent_medway_lad_boundaries.geojson');
    rawGeoJSON = await geoRes.json();

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
      map.addSource('lad', {
        type: 'geojson',
        data: rawGeoJSON!,
        generateId: true,
      });

      map.addLayer({
        id: 'lad-fill',
        type: 'fill',
        source: 'lad',
        paint: {
          'fill-color': '#7c83ff',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.18,
            0.05,
          ],
        },
      });

      map.addLayer({
        id: 'lad-outline',
        type: 'line',
        source: 'lad',
        paint: {
          'line-color': '#7c83ff',
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            1.8,
            0.7,
          ],
          'line-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.95,
            0.45,
          ],
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
        tooltip.visible = true;
        tooltip.x = e.point.x;
        tooltip.y = e.point.y;
        tooltip.name = (props['LAD24NM'] as string) ?? '';
        tooltip.payroll = typeof payroll === 'number' ? formatGbp(payroll) : '';
      });

      map.on('mouseleave', 'lad-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'lad', id: hoveredId }, { hover: false });
          hoveredId = null;
        }
        tooltip.visible = false;
      });

      mapLoaded = true;
    });
  });

  onDestroy(() => {
    map?.remove();
  });
</script>

<div class="map-wrap">
  <div bind:this={mapContainer} class="map"></div>

  {#if tooltip.visible}
    <div
      class="tooltip"
      style="transform: translate({tooltip.x + 14}px, {tooltip.y - 42}px)"
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
