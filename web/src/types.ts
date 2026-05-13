export interface FlowBreakdown {
  hmrc_gbp: number;
  income_tax_gbp: number;
  employee_ni_gbp: number;
  water_gbp: number;
  energy_gbp: number;
  council_tax_gbp: number;
  unaccounted_gbp: number;
}

export interface LadData {
  lad_code: string;
  lad_name: string;
  employee_count: number;
  median_pay_gbp: number;
  total_payroll_estimate_gbp: number;
  period_start: string;
  period_end: string;
  confidence: 'measured' | 'estimated' | 'modelled';
  source_id: string;
  fetched_at: string;
  dwellings: number;
  flows: FlowBreakdown;
  /** Cumulative thresholds [t0, t1, t2, t3] for GPU particle routing.
   *  r<t0→HMRC, t0≤r<t1→water, t1≤r<t2→energy, t2≤r<t3→council_tax, r≥t3→unaccounted */
  flow_thresholds: [number, number, number, number];
}

export interface FlowMeta {
  label: string;
  description: string;
  confidence: 'measured' | 'estimated' | 'modelled';
  methodology: string;
}

export interface SourceMeta {
  source_id: string;
  name: string;
  publisher: string;
  dataset_url: string;
  file_url: string;
  fetched_at: string;
  license: string;
  methodology: string;
}

export interface FlowBundle {
  period: string;
  period_start: string;
  period_end: string;
  generated_at: string;
  source: SourceMeta;
  flow_meta: Record<string, FlowMeta>;
  lads: LadData[];
}

export type FlowType = 'hmrc' | 'water' | 'energy' | 'council_tax' | 'unaccounted';

export type PanelSelection =
  | { kind: 'flow'; type: FlowType }
  | { kind: 'lad'; lad: LadData }
  | null;

export interface TextSegment {
  text: string;
  term?: string;
  definition?: string;
}

export const FLOW_AMOUNT_KEY: Record<FlowType, keyof FlowBreakdown> = {
  hmrc:        'hmrc_gbp',
  water:       'water_gbp',
  energy:      'energy_gbp',
  council_tax: 'council_tax_gbp',
  unaccounted: 'unaccounted_gbp',
};

export function parseMethodologyText(text: string, glossary: Record<string, string>): TextSegment[] {
  const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
  const result: TextSegment[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    let bestIdx = -1;
    let bestTerm = '';

    for (const term of terms) {
      const idx = remaining.toLowerCase().indexOf(term.toLowerCase());
      if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) {
        bestIdx = idx;
        bestTerm = term;
      }
    }

    if (bestIdx === -1) {
      result.push({ text: remaining });
      break;
    }
    if (bestIdx > 0) result.push({ text: remaining.slice(0, bestIdx) });
    result.push({
      text: remaining.slice(bestIdx, bestIdx + bestTerm.length),
      term: bestTerm,
      definition: glossary[bestTerm],
    });
    remaining = remaining.slice(bestIdx + bestTerm.length);
  }

  return result;
}

export const FLOW_TYPES: FlowType[] = ['hmrc', 'water', 'energy', 'council_tax', 'unaccounted'];

export const FLOW_COLORS: Record<FlowType, [number, number, number]> = {
  hmrc:         [1.00, 0.25, 0.35],  // #ff4059 — hot red
  water:        [0.00, 0.82, 1.00],  // #00d1ff — electric cyan
  energy:       [1.00, 0.85, 0.00],  // #ffd900 — electric amber
  council_tax:  [0.27, 1.00, 0.53],  // #45ff88 — electric green
  unaccounted:  [0.38, 0.38, 0.63],  // #6060a0 — muted slate
};

export const FLOW_COLORS_HEX: Record<FlowType, string> = {
  hmrc:         '#ff4059',
  water:        '#00d1ff',
  energy:       '#ffd900',
  council_tax:  '#45ff88',
  unaccounted:  '#6060a0',
};
