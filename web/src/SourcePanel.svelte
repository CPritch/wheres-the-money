<script lang="ts">
  import type { SourceMeta } from './types';

  const { source }: { source: SourceMeta | null } = $props();

  function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
</script>

{#if source}
  <aside class="source-panel">
    <div class="panel-row panel-header">
      <span class="badge measured">measured</span>
      <span class="badge license">{source.license}</span>
    </div>

    <div class="source-name">{source.publisher}</div>

    <a
      class="dataset-link"
      href={source.dataset_url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {source.name.length > 52 ? source.name.slice(0, 52) + '…' : source.name} ↗
    </a>

    <p class="methodology">{source.methodology}</p>

    <div class="fetched">Fetched {formatDate(source.fetched_at)}</div>
  </aside>
{/if}

<style>
  .source-panel {
    position: absolute;
    bottom: 2rem;
    right: 0.75rem;
    width: 17rem;
    background: rgba(8, 8, 20, 0.88);
    border: 1px solid rgba(124, 131, 255, 0.2);
    border-radius: 6px;
    padding: 0.75rem 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    backdrop-filter: blur(8px);
    font-size: 0.75rem;
    color: #a0a0b8;
    pointer-events: all;
  }

  .panel-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .badge {
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 0.15rem 0.45rem;
    border-radius: 3px;
  }

  .measured {
    background: rgba(64, 196, 128, 0.15);
    color: #40c480;
    border: 1px solid rgba(64, 196, 128, 0.3);
  }

  .license {
    background: rgba(124, 131, 255, 0.1);
    color: #7c83ff;
    border: 1px solid rgba(124, 131, 255, 0.25);
  }

  .source-name {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #e8e8f0;
    letter-spacing: 0.01em;
  }

  .dataset-link {
    color: #7c83ff;
    text-decoration: none;
    font-size: 0.6875rem;
    line-height: 1.4;
    word-break: break-word;
  }

  .dataset-link:hover {
    text-decoration: underline;
    color: #a0a6ff;
  }

  .methodology {
    font-size: 0.6875rem;
    line-height: 1.5;
    color: #6a6a88;
    margin: 0;
  }

  .fetched {
    font-size: 0.625rem;
    color: #3a3a52;
    margin-top: 0.1rem;
  }
</style>
