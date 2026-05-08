# Where's the Money?

A visualisation of how payroll moves out of Kent and Medway — into HMRC, water companies, energy suppliers, councils, and the unaccounted rest.

Every number on screen is traceable to a published dataset. Every modelled value is labelled as such.

**Status:** Milestone 1 — skeleton deploy.

---

## Structure

```
wheres-the-money/
├── ingest/        Python — per-source ETL scripts
├── data/          Parquet files (gitignored except fixtures)
├── export/        Python — DuckDB queries that build frontend bundles
├── web/           TypeScript / Svelte / Three.js frontend
├── docs/          Source documentation, methodology notes, glossary
└── README.md
```

## Development

**Prerequisites:** [uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/)

```bash
make ingest    # fetch upstream data → /data
make export    # build frontend data bundles → /web/public/data
make web       # build the frontend
```

## License

Code: [MIT](LICENSE)  
Derived data: CC-BY-4.0 (see individual dataset notes in `/docs`)
