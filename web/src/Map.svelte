<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import maplibregl from 'maplibre-gl';

  // CARTO dark-matter — free vector tile basemap, no API key required
  const STYLE_URL =
    'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  // Kent + Medway centroid, zoom fits all 13 LADs
  const KENT_CENTER: [number, number] = [0.75, 51.25];
  const KENT_ZOOM = 9;

  let mapContainer: HTMLDivElement;
  let map: maplibregl.Map;

  let tooltip = $state({ visible: false, x: 0, y: 0, name: '' });
  let hoveredId: number | string | null = null;

  onMount(() => {
    map = new maplibregl.Map({
      container: mapContainer,
      style: STYLE_URL,
      center: KENT_CENTER,
      zoom: KENT_ZOOM,
      attributionControl: false,
      // Disable rotation — not needed for a county-level static view
      dragRotate: false,
      touchPitch: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      'bottom-right',
    );

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource('lad', {
        type: 'geojson',
        data: '/data/kent_medway_lad_boundaries.geojson',
        // generateId assigns numeric IDs so setFeatureState works
        generateId: true,
      });

      // Subtle fill — mostly invisible, brightens on hover
      map.addLayer({
        id: 'lad-fill',
        type: 'fill',
        source: 'lad',
        paint: {
          'fill-color': '#7c83ff',
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.12,
            0.03,
          ],
        },
      });

      // Boundary lines — thin at rest, brighter on hover
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

        tooltip.visible = true;
        tooltip.x = e.point.x;
        tooltip.y = e.point.y;
        tooltip.name = (feature.properties as { LAD24NM?: string }).LAD24NM ?? '';
      });

      map.on('mouseleave', 'lad-fill', () => {
        map.getCanvas().style.cursor = '';
        if (hoveredId !== null) {
          map.setFeatureState({ source: 'lad', id: hoveredId }, { hover: false });
          hoveredId = null;
        }
        tooltip.visible = false;
      });
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
      style="transform: translate({tooltip.x + 14}px, {tooltip.y - 36}px)"
    >
      {tooltip.name}
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
    background: rgba(8, 8, 18, 0.88);
    border: 1px solid rgba(124, 131, 255, 0.45);
    color: #e8e8f0;
    padding: 0.35rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8125rem;
    font-weight: 500;
    white-space: nowrap;
    backdrop-filter: blur(6px);
    letter-spacing: 0.01em;
    /* GPU-accelerated positioning via transform — avoids reflow */
    will-change: transform;
  }
</style>
