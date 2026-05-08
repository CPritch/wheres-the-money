<script lang="ts">
  declare const __BUILD_DATE__: string;

  const buildDate = new Date(__BUILD_DATE__).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
</script>

<main>
  <div class="hero">
    <h1>Where's the Money?</h1>
    <p class="tagline">
      Every pound of Kent payroll, traced to where it goes.
    </p>
    <p class="status">
      Coming soon — visualisation in progress.
    </p>
    <p class="deploy-date">Deployed {buildDate}</p>
  </div>
</main>

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: #0a0a0f;
    color: #e8e8f0;
    font-family: "Inter", system-ui, sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  main {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
  }

  .hero {
    text-align: center;
    max-width: 600px;
  }

  h1 {
    font-size: clamp(2.5rem, 8vw, 5rem);
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.05;
    background: linear-gradient(135deg, #e8e8f0 30%, #7c83ff 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 1.5rem;
  }

  .tagline {
    font-size: 1.15rem;
    font-weight: 300;
    color: #a0a0b8;
    margin-bottom: 2.5rem;
    line-height: 1.6;
  }

  .status {
    display: inline-block;
    font-size: 0.875rem;
    font-weight: 600;
    color: #7c83ff;
    border: 1px solid #7c83ff44;
    border-radius: 100px;
    padding: 0.4rem 1rem;
    margin-bottom: 2rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .deploy-date {
    font-size: 0.75rem;
    color: #505068;
    margin-top: 1rem;
  }
</style>
