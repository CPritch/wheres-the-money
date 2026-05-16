<script lang="ts">
  import { formatGbp } from './types';

  const { totalPayroll, districtCount, periodLabel }: {
    totalPayroll: number;
    districtCount: number;
    periodLabel: string;
  } = $props();
</script>

<header class="masthead">
  <div class="masthead-left">
    <p class="kicker">{periodLabel} · Kent &amp; Medway</p>
    <h1 class="title">Where&rsquo;s the Money?</h1>
    <p class="tagline">Every pound of Kent payroll, traced to where it goes.</p>
  </div>

  <div class="masthead-right">
    <div class="big-number">
      <span class="big-amount">{formatGbp(totalPayroll)}</span>
      <span class="big-period">/m</span>
    </div>
    <p class="big-caption">Monthly payroll, {districtCount} districts</p>
  </div>
</header>

<style>
  .masthead {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 1.25rem 1.75rem 1rem;
    border-bottom: 1px solid var(--rule);
    gap: 2rem;
    background: var(--paper);
  }

  .masthead-left {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .kicker {
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0;
  }

  .title {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(2rem, 3.4vw, 2.85rem);
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.005em;
    margin: 0.05rem 0 0;
  }

  .tagline {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 0.95rem;
    color: var(--ink-soft);
    margin: 0.15rem 0 0;
    font-weight: 400;
    border-top: 1px solid var(--rule);
    padding-top: 0.35rem;
    max-width: 28rem;
  }

  .masthead-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.05rem;
    flex-shrink: 0;
  }

  .big-number {
    display: flex;
    align-items: baseline;
    gap: 0.1rem;
  }

  .big-amount {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-weight: 500;
    font-size: clamp(2rem, 3.4vw, 2.85rem);
    line-height: 1;
    color: var(--ink);
    letter-spacing: -0.01em;
  }

  .big-period {
    font-family: 'EB Garamond', Georgia, serif;
    font-style: italic;
    font-size: 1.15rem;
    color: var(--ink-mute);
    line-height: 1;
    margin-left: 0.05rem;
  }

  .big-caption {
    font-family: 'Inter', sans-serif;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-mute);
    margin: 0.25rem 0 0;
  }
</style>
