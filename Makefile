.PHONY: ingest export web install-python install-node

# Install all dependencies
install-python:
	uv sync --all-packages

install-node:
	pnpm install

# Run all ingest scripts — fetches upstream data into /data
ingest: install-python
	uv run python -m ingest.run_all

# Run DuckDB export — materialises frontend bundles into /web/public/data
export: install-python
	uv run python -m export.run_all

# Build the frontend
web: install-node
	pnpm build

# Run the full pipeline
all: ingest export web
