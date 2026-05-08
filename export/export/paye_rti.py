"""
Export PAYE RTI → frontend JSON bundle.

Reads data/paye_rti/kent_medway_2025_10.parquet via DuckDB and writes
web/public/data/flows/2025-10.json — keyed by month so the frontend's
data layer is month-aware from day one.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

DATA_DIR = Path(__file__).parents[2] / "data" / "paye_rti"
OUT_DIR = Path(__file__).parents[2] / "web" / "public" / "data" / "flows"

COLS = [
    "lad_code",
    "lad_name",
    "employee_count",
    "median_pay_gbp",
    "total_payroll_estimate_gbp",
    "period_start",
    "period_end",
    "confidence",
    "source_id",
    "fetched_at",
]


def run(data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR) -> Path:
    parquet = data_dir / "kent_medway_2025_10.parquet"
    meta_path = data_dir / "kent_medway_2025_10_meta.json"

    if not parquet.exists():
        raise FileNotFoundError(
            f"Parquet not found: {parquet}\nRun `make ingest` first."
        )

    meta = json.loads(meta_path.read_text())

    con = duckdb.connect()
    rows = con.execute(f"""
        SELECT {', '.join(COLS)}
        FROM read_parquet('{parquet}')
        ORDER BY total_payroll_estimate_gbp DESC
    """).fetchall()

    lads = [dict(zip(COLS, row)) for row in rows]

    bundle = {
        "period": "2025-10",
        "period_start": "2025-10-01",
        "period_end": "2025-10-31",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": meta,
        "lads": lads,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "2025-10.json"
    out_path.write_text(json.dumps(bundle, indent=2))
    print(f"Wrote {len(lads)} LADs → {out_path}")
    return out_path
