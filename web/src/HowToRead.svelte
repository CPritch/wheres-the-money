<script lang="ts">
  import { CATEGORY_ORDER, CATEGORY_LABELS, CATEGORY_COLORS_HEX } from './types';
</script>

<aside class="legend">
  <h2 class="legend-title">How to read</h2>

  <section class="legend-section">
    <p class="legend-sub">
      <span class="legend-rule-num">I</span>
      Colour <em>= category</em>
    </p>
    <ul class="legend-list">
      {#each CATEGORY_ORDER as cat}
        <li>
          <span class="dot" style="background:{CATEGORY_COLORS_HEX[cat]};"></span>
          <span>{CATEGORY_LABELS[cat]}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="legend-section">
    <p class="legend-sub">
      <span class="legend-rule-num">II</span>
      Shape <em>= confidence</em>
    </p>
    <ul class="legend-list">
      <li>
        <span class="shape shape-measured"></span>
        <span>measured</span>
      </li>
      <li>
        <span class="shape shape-estimated"></span>
        <span>estimated</span>
      </li>
      <li>
        <span class="shape shape-modelled"></span>
        <span>modelled</span>
      </li>
    </ul>
  </section>
</aside>

<style>
  .legend {
    background: transparent;
    padding: 0.75rem 0 0.5rem 0;
    font-family: 'Inter', sans-serif;
    color: var(--ink);
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 1.1rem;
    box-sizing: border-box;
    min-width: 0;
  }

  .legend-title {
    font-family: 'Inter', sans-serif;
    font-size: 0.625rem;
    font-weight: 700;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--rule);
  }

  .legend-section {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .legend-sub {
    font-family: 'EB Garamond', Georgia, serif;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--ink);
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    line-height: 1.2;
  }

  .legend-sub em {
    font-style: italic;
    color: var(--ink-soft);
    font-weight: 400;
  }

  .legend-rule-num {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.95rem;
    color: var(--ink-mute);
    width: 0.9rem;
    text-align: center;
  }

  .legend-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding-left: 1.4rem;
  }

  .legend-list li {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    font-size: 0.75rem;
    color: var(--ink-soft);
    font-family: 'EB Garamond', Georgia, serif;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
    display: inline-block;
  }

  .shape {
    width: 16px;
    flex-shrink: 0;
    display: inline-flex;
    justify-content: center;
    align-items: center;
  }

  .shape-measured {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ink);
  }

  .shape-estimated {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid var(--ink);
    background: transparent;
  }

  .shape-modelled {
    height: 2px;
    width: 16px;
    background-image: repeating-linear-gradient(
      to right,
      var(--ink) 0 4px,
      transparent 4px 7px
    );
  }
</style>
