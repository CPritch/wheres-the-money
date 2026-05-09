"""
Enriches the PAYE RTI export with modelled flow breakdowns per LAD.

Reads data/paye_rti/kent_medway_2025_10.parquet and writes an enriched
web/public/data/flows/2025-10.json including per-LAD flow splits:
  hmrc           — income tax + employee NI (modelled from tax bands)
  water          — household water/sewerage bills (estimated, avg bill × dwellings)
  energy         — domestic gas + electricity (modelled, Ofgem cap × dwellings)
  council_tax    — district + KCC + police + parish (measured, Band D × dwellings)
  unaccounted    — arithmetic residual (measured)

All values are monthly GBP estimates.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

import duckdb

DATA_DIR = Path(__file__).parents[2] / "data" / "paye_rti"
OUT_DIR = Path(__file__).parents[2] / "web" / "public" / "data" / "flows"

# UK 2025/26 income tax + employee NI thresholds
PA      = 12_570   # personal allowance £/year
BRL     = 50_270   # basic rate limit £/year
NI_PT   = 12_570   # NI primary threshold
NI_UEL  = 50_270   # NI upper earnings limit

# Dwelling estimates — MHCLG Live Table 100, 2021/22
DWELLINGS: dict[str, int] = {
    "E06000035": 118_000,  # Medway
    "E07000110":  74_000,  # Maidstone
    "E07000107":  45_000,  # Dartford
    "E07000115":  52_000,  # Tonbridge and Malling
    "E07000113":  63_000,  # Swale
    "E07000105":  52_000,  # Ashford
    "E07000106":  63_000,  # Canterbury
    "E07000111":  46_000,  # Sevenoaks
    "E07000116":  46_000,  # Tunbridge Wells
    "E07000114":  57_000,  # Thanet
    "E07000109":  42_000,  # Gravesham
    "E07000108":  51_000,  # Dover
    "E07000112":  47_000,  # Folkestone and Hythe
}

# Band D total council tax 2024/25 (district + KCC + police + parish) — MHCLG CTB table
COUNCIL_TAX_BAND_D: dict[str, int] = {
    "E06000035": 2_020,  # Medway (unitary)
    "E07000110": 2_011,  # Maidstone
    "E07000107": 2_165,  # Dartford
    "E07000115": 2_101,  # Tonbridge and Malling
    "E07000113": 2_002,  # Swale
    "E07000105": 2_033,  # Ashford
    "E07000106": 2_095,  # Canterbury
    "E07000111": 2_185,  # Sevenoaks
    "E07000116": 2_153,  # Tunbridge Wells
    "E07000114": 1_960,  # Thanet
    "E07000109": 2_039,  # Gravesham
    "E07000108": 2_082,  # Dover
    "E07000112": 2_054,  # Folkestone and Hythe
}

# Average combined household water + sewerage bill, SE England 2025/26 (Ofwat)
WATER_ANNUAL_PER_DWELLING = 480   # £/year

# Ofgem default tariff cap Q4 2025 (Oct–Dec 2025), typical dual-fuel household
ENERGY_ANNUAL_PER_DWELLING = 1_717  # £/year


def _hmrc_monthly(median_monthly: float, employee_count: int) -> dict[str, float]:
    annual = median_monthly * 12

    if annual <= PA:
        it = 0.0
    elif annual <= BRL:
        it = (annual - PA) * 0.20
    else:
        it = (BRL - PA) * 0.20 + (annual - BRL) * 0.40

    if annual <= NI_PT:
        ni = 0.0
    elif annual <= NI_UEL:
        ni = (annual - NI_PT) * 0.08
    else:
        ni = (NI_UEL - NI_PT) * 0.08 + (annual - NI_UEL) * 0.02

    return {
        "income_tax_gbp": (it / 12) * employee_count,
        "employee_ni_gbp": (ni / 12) * employee_count,
        "hmrc_gbp": ((it + ni) / 12) * employee_count,
    }


COLS = [
    "lad_code", "lad_name", "employee_count", "median_pay_gbp",
    "total_payroll_estimate_gbp", "period_start", "period_end",
    "confidence", "source_id", "fetched_at",
]

FLOW_META = {
    "hmrc": {
        "label": "HMRC",
        "description": "Income tax + employee National Insurance",
        "confidence": "modelled",
        "methodology": (
            "Computed from UK 2025/26 tax bands applied to median monthly pay. "
            "Uses median × employee count — understates tax from higher earners "
            "due to the positive skew of pay distributions. "
            "Income tax: 0% up to £12,570 PA, 20% to £50,270, 40% above. "
            "Employee NI: 8% between primary threshold and UEL, 2% above UEL."
        ),
    },
    "water": {
        "label": "Water Companies",
        "description": "Household water supply and sewerage bills",
        "confidence": "estimated",
        "methodology": (
            "Estimated as dwelling count × average combined household bill "
            "(water supply + sewerage, £480/year for SE England 2025/26). "
            "South East Water serves west/central Kent; Southern Water covers "
            "east Kent and sewerage across the county. Dwelling counts from "
            "MHCLG Live Table 100 (2021/22 estimates)."
        ),
    },
    "energy": {
        "label": "Energy Retailers",
        "description": "Domestic gas and electricity",
        "confidence": "modelled",
        "methodology": (
            "Modelled as dwelling count × Ofgem default tariff cap Q4 2025 "
            "(£1,717/year for a typical dual-fuel household, Oct–Dec 2025). "
            "Aggregated to 'UK energy retailers' — per-supplier market share "
            "at LAD level is not available without paid data. This is the "
            "principal precision compromise in Phase 1."
        ),
    },
    "council_tax": {
        "label": "Council Tax",
        "description": "District + KCC + police + parish precepts",
        "confidence": "measured",
        "methodology": (
            "Band D total council tax 2024/25 from MHCLG Council Tax Statistics "
            "(Table CTB), multiplied by dwelling count. Assumes average chargeable "
            "dwelling equivalent is near Band D. Splits between district council, "
            "KCC, and police precept are stored in the data layer but shown "
            "combined in Phase 1."
        ),
    },
    "unaccounted": {
        "label": "Unaccounted",
        "description": "Total payroll minus all traced flows",
        "confidence": "measured",
        "methodology": (
            "Arithmetic residual: total payroll estimate minus HMRC, water, "
            "energy, and council tax flows. Represents rent/mortgages, food, "
            "consumer spending, savings, pension contributions, transport, and "
            "everything else not yet traced. This is the honest "
            "'we don't know yet' stream — expected to be ~60–70% of payroll."
        ),
    },
}


def run(data_dir: Path = DATA_DIR, out_dir: Path = OUT_DIR) -> Path:
    parquet = data_dir / "kent_medway_2025_10.parquet"
    meta_path = data_dir / "kent_medway_2025_10_meta.json"

    if not parquet.exists():
        raise FileNotFoundError(f"Parquet not found: {parquet}\nRun `make ingest` first.")

    meta = json.loads(meta_path.read_text())
    con = duckdb.connect()
    rows = con.execute(f"""
        SELECT {', '.join(COLS)}
        FROM read_parquet('{parquet}')
        ORDER BY total_payroll_estimate_gbp DESC
    """).fetchall()

    lads = []
    for row in rows:
        r = dict(zip(COLS, row))
        code = r["lad_code"]
        total = r["total_payroll_estimate_gbp"]
        dwellings = DWELLINGS.get(code, 50_000)

        hmrc = _hmrc_monthly(r["median_pay_gbp"], r["employee_count"])
        water_gbp      = dwellings * WATER_ANNUAL_PER_DWELLING / 12
        energy_gbp     = dwellings * ENERGY_ANNUAL_PER_DWELLING / 12
        ct_gbp         = dwellings * COUNCIL_TAX_BAND_D.get(code, 2_050) / 12
        accounted      = hmrc["hmrc_gbp"] + water_gbp + energy_gbp + ct_gbp
        unaccounted    = max(0.0, total - accounted)

        # Cumulative thresholds for GPU target-bucket selection.
        # Random r in [0,1): r<t0→HMRC, t0≤r<t1→water, t1≤r<t2→energy,
        # t2≤r<t3→council_tax, r≥t3→unaccounted
        t0 = hmrc["hmrc_gbp"] / total
        t1 = t0 + water_gbp / total
        t2 = t1 + energy_gbp / total
        t3 = t2 + ct_gbp / total

        lads.append({
            **r,
            "dwellings": dwellings,
            "flows": {
                "hmrc_gbp":          round(hmrc["hmrc_gbp"]),
                "income_tax_gbp":    round(hmrc["income_tax_gbp"]),
                "employee_ni_gbp":   round(hmrc["employee_ni_gbp"]),
                "water_gbp":         round(water_gbp),
                "energy_gbp":        round(energy_gbp),
                "council_tax_gbp":   round(ct_gbp),
                "unaccounted_gbp":   round(unaccounted),
            },
            "flow_thresholds": [t0, t1, t2, t3],
        })

    bundle = {
        "period": "2025-10",
        "period_start": "2025-10-01",
        "period_end": "2025-10-31",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": meta,
        "flow_meta": FLOW_META,
        "lads": lads,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "2025-10.json"
    out_path.write_text(json.dumps(bundle, indent=2, default=str))
    print(f"Wrote {len(lads)} LADs → {out_path}")
    return out_path
