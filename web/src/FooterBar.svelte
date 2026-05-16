<script lang="ts">
  const { period, deployedDate, onMethodologyOpen }: {
    period: string;        // e.g. "October 2025"
    deployedDate: string;  // formatted date
    onMethodologyOpen: () => void;
  } = $props();

  // Static timeline chrome (Phase 1: no scrubbing). Renders Oct 2025 as the
  // active column. Tick layout mirrors the design's three-year visible span.
  const YEARS = [2024, 2025, 2026];
  const MONTHS_PER_YEAR = 12;
</script>

<div class="footer-bar">
  <div class="timeline-row">
    <div class="play-block" aria-label="Playback controls (static in Phase 1)">
      <button class="play-btn" disabled title="Time scrubbing arrives in Phase 2">
        <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <rect x="2" y="2" width="3" height="8" fill="currentColor" />
          <rect x="7" y="2" width="3" height="8" fill="currentColor" />
        </svg>
      </button>
      <div class="speed">
        <span class="speed-label">Speed</span>
        <span class="speed-value">1×</span>
      </div>
    </div>

    <div class="scrubber">
      <div class="scrubber-track" role="presentation">
        {#each YEARS as year (year)}
          <div class="year-block" class:year-active={year === 2025}>
            <div class="months">
              {#each Array(MONTHS_PER_YEAR) as _, m (m)}
                <div
                  class="month-tick"
                  class:month-active={year === 2025 && m === 9}
                ></div>
              {/each}
            </div>
            <span class="year-label">{year}</span>
          </div>
        {/each}
      </div>
    </div>

    <div class="period-block">
      <button class="step-arrow" disabled aria-label="Previous month (Phase 2)">&lsaquo;</button>
      <span class="period-label">{period}</span>
      <button class="step-arrow" disabled aria-label="Next month (Phase 2)">&rsaquo;</button>
    </div>
  </div>

  <div class="credits-row">
    <span class="credit-deployed">Deployed {deployedDate}</span>
    <span class="credit-sep">·</span>
    <span class="credit-tag">Milestone 8.1 — design polish</span>
    <span class="credit-sep">·</span>
    <button class="credit-link" onclick={onMethodologyOpen}>Sources &amp; methodology</button>
    <span class="credit-spacer"></span>
    <span class="credit-attrib">© Carto · OpenStreetMap contributors</span>
  </div>
</div>

<style>
  .footer-bar {
    border-top: 1px solid var(--rule);
    background: var(--paper);
    font-family: 'Inter', sans-serif;
    color: var(--ink-mute);
    font-size: 0.6875rem;
  }

  .timeline-row {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 1.25rem;
    align-items: center;
    padding: 0.55rem 1.75rem;
  }

  .play-block {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex-shrink: 0;
  }

  .play-btn {
    width: 26px;
    height: 26px;
    border: 1px solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: not-allowed;
    opacity: 0.55;
    padding: 0;
  }

  .speed {
    display: flex;
    flex-direction: column;
    line-height: 1;
  }

  .speed-label {
    font-size: 0.5625rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
  }

  .speed-value {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.9rem;
    color: var(--ink);
    margin-top: 0.05rem;
  }

  .scrubber-track {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 0.4rem;
  }

  .year-block {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    opacity: 0.55;
  }

  .year-block.year-active {
    opacity: 1;
  }

  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    height: 12px;
    align-items: end;
    gap: 1px;
  }

  .month-tick {
    height: 6px;
    background: var(--ink);
    opacity: 0.18;
  }

  .month-active {
    height: 12px;
    background: var(--statutory);
    opacity: 0.85;
  }

  .year-label {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.78rem;
    color: var(--ink-mute);
  }

  .year-active .year-label {
    color: var(--ink);
  }

  .period-block {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .step-arrow {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 1.15rem;
    line-height: 1;
    cursor: not-allowed;
    opacity: 0.5;
    padding: 0 0.15rem;
  }

  .period-label {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: 1.15rem;
    color: var(--ink);
    letter-spacing: -0.005em;
  }

  .credits-row {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.4rem 1.75rem 0.55rem;
    border-top: 1px solid var(--rule);
    font-size: 0.625rem;
    color: var(--ink-mute);
    letter-spacing: 0.04em;
  }

  .credit-sep {
    color: var(--rule);
  }

  .credit-spacer {
    flex: 1;
  }

  .credit-link {
    background: none;
    border: none;
    color: var(--ink-mute);
    font-family: inherit;
    font-size: inherit;
    letter-spacing: inherit;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: var(--rule);
  }

  .credit-link:hover {
    color: var(--ink);
    text-decoration-color: var(--ink);
  }

  .credit-attrib {
    font-style: italic;
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.7rem;
  }

  /* ── Mobile ─────────────────────────────────────────────── */
  @media (max-width: 768px) {
    .timeline-row { display: none; }

    .credits-row {
      padding: 0.4rem 0.9rem 0.5rem;
      flex-wrap: wrap;
      row-gap: 0.2rem;
      font-size: 0.6rem;
      /* leave room for the bottom-sheet peek (72px) so the credits row
         doesn't get covered by the sheet */
      padding-bottom: calc(72px + 0.5rem);
    }

    /* The MapLibre attribution already states Carto + OSM in the map
       chrome on mobile, so the per-app attribution caption is redundant
       in the credits row. Drop it to keep the row to a single line. */
    .credit-spacer,
    .credit-attrib {
      display: none;
    }

    .credit-tag {
      display: none;
    }
  }
</style>
