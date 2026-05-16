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
  | { kind: 'overall' }
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

// ── Categories ──────────────────────────────────────────────────────────────
// Rule I (System reference): colour belongs to the category, never the flow.
// Phase 1 ships three categories — the rest (commerce, capital, local civic)
// are deferred per the plan and are not rendered in Phase 1.

export type Category = 'statutory' | 'utilities' | 'unaccounted';

export const CATEGORY_OF: Record<FlowType, Category> = {
  hmrc:        'statutory',
  council_tax: 'statutory',
  water:       'utilities',
  energy:      'utilities',
  unaccounted: 'unaccounted',
};

export const CATEGORY_LABELS: Record<Category, string> = {
  statutory:   'Statutory',
  utilities:   'Utilities',
  unaccounted: 'Unaccounted',
};

/** Editorial palette from the canonical design (warm cream ground). */
export const CATEGORY_COLORS_HEX: Record<Category, string> = {
  statutory:   '#A23D2E',  // brick red
  utilities:   '#234F66',  // deep navy
  unaccounted: '#6B6358',  // warm slate
};

/** Same colours as 0-1 RGB tuples for the particle system. */
export const CATEGORY_COLORS: Record<Category, [number, number, number]> = {
  statutory:   [0.635, 0.239, 0.180],
  utilities:   [0.137, 0.310, 0.400],
  unaccounted: [0.420, 0.388, 0.345],
};

/** Per-flow particle colour = colour of the flow's category (rule I). */
export const FLOW_COLORS: Record<FlowType, [number, number, number]> = {
  hmrc:        CATEGORY_COLORS.statutory,
  council_tax: CATEGORY_COLORS.statutory,
  water:       CATEGORY_COLORS.utilities,
  energy:      CATEGORY_COLORS.utilities,
  unaccounted: CATEGORY_COLORS.unaccounted,
};

export const FLOW_COLORS_HEX: Record<FlowType, string> = {
  hmrc:        CATEGORY_COLORS_HEX.statutory,
  council_tax: CATEGORY_COLORS_HEX.statutory,
  water:       CATEGORY_COLORS_HEX.utilities,
  energy:      CATEGORY_COLORS_HEX.utilities,
  unaccounted: CATEGORY_COLORS_HEX.unaccounted,
};

// ── Confidence shapes ───────────────────────────────────────────────────────
// Rule II (System reference): confidence belongs to the shape, never the colour.
//   measured   → filled solid dot   (•)
//   estimated  → hollow ring        (○)
//   modelled   → dashed segment     (− − −)

export type Confidence = 'measured' | 'estimated' | 'modelled';

export const CONFIDENCE_GLYPH: Record<Confidence, string> = {
  measured:  '•',
  estimated: '◦',
  modelled:  '—',  // an em-dash on its own; visually paired with dashes in CSS
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

/** Display order: Statutory rows first, then Utilities, then Unaccounted. */
export const FLOW_TYPES_ORDERED: FlowType[] = [
  'hmrc', 'council_tax',         // statutory
  'water', 'energy',             // utilities
  'unaccounted',                 // unaccounted
];

export const CATEGORY_ORDER: Category[] = ['statutory', 'utilities', 'unaccounted'];

export const FLOWS_BY_CATEGORY: Record<Category, FlowType[]> = {
  statutory:   ['hmrc', 'council_tax'],
  utilities:   ['water', 'energy'],
  unaccounted: ['unaccounted'],
};

// ── Layer toggles ────────────────────────────────────────────────────────────

export type LayerToggleState = 'off' | 'raw_only' | 'on';
export type LayerToggles = Record<FlowType, LayerToggleState>;

/** Flows with any modelling/estimation component — these support tri-state toggles. */
export const LAYER_HAS_MODELLING: Record<FlowType, boolean> = {
  hmrc:         true,   // fully modelled
  water:        true,   // estimated
  energy:       true,   // fully modelled
  council_tax:  false,  // measured
  unaccounted:  false,  // measured arithmetic residual
};

export const DEFAULT_TOGGLES: LayerToggles = {
  hmrc:         'on',
  water:        'on',
  energy:       'on',
  council_tax:  'on',
  unaccounted:  'on',
};

export function isLayerEffectivelyOff(
  state: LayerToggleState,
  confidence: string,
): boolean {
  return state === 'off' || (state === 'raw_only' && confidence !== 'measured');
}

/** Apply the global raw-only master switch on top of per-layer toggle states. */
export function resolveEffectiveToggles(
  toggles: LayerToggles,
  rawOnly: boolean,
  flowMeta: Record<string, FlowMeta>,
): LayerToggles {
  if (!rawOnly) return toggles;
  return Object.fromEntries(
    FLOW_TYPES.map(ft => {
      const confidence = flowMeta[ft]?.confidence ?? 'measured';
      const state: LayerToggleState =
        confidence !== 'measured' && toggles[ft] !== 'off' ? 'raw_only' : toggles[ft];
      return [ft, state];
    }),
  ) as LayerToggles;
}

/** Per-flow display amounts adjusted for the current toggle state.
 *  Unaccounted grows to absorb any flows that are toggled off. */
export function computeDisplayAmounts(
  bundle: FlowBundle,
  effectiveToggles: LayerToggles,
): Record<FlowType, number> {
  const result = {} as Record<FlowType, number>;
  const nonUnaccounted: FlowType[] = ['hmrc', 'water', 'energy', 'council_tax'];
  const totalPayroll = bundle.lads.reduce((s, l) => s + l.total_payroll_estimate_gbp, 0);
  let visibleSum = 0;

  for (const ft of nonUnaccounted) {
    const total = bundle.lads.reduce((s, l) => s + (l.flows[FLOW_AMOUNT_KEY[ft]] as number), 0);
    const confidence = bundle.flow_meta[ft]?.confidence ?? 'measured';
    const eff = isLayerEffectivelyOff(effectiveToggles[ft], confidence) ? 0 : total;
    result[ft] = eff;
    visibleSum += eff;
  }

  const adjUnaccounted = Math.max(0, totalPayroll - visibleSum);
  result.unaccounted = effectiveToggles.unaccounted === 'off' ? 0 : adjUnaccounted;
  return result;
}

export function formatGbp(n: number): string {
  if (n >= 1_000_000_000) return `£${(n / 1_000_000_000).toFixed(2)}bn`;
  if (n >= 100_000_000)   return `£${(n / 1_000_000).toFixed(0)}m`;
  if (n >= 1_000_000)     return `£${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1_000)         return `£${(n / 1_000).toFixed(0)}k`;
  return `£${n.toFixed(0)}`;
}

export function computeCategoryAmounts(
  displayAmounts: Record<FlowType, number>,
): Record<Category, number> {
  return {
    statutory:   displayAmounts.hmrc + displayAmounts.council_tax,
    utilities:   displayAmounts.water + displayAmounts.energy,
    unaccounted: displayAmounts.unaccounted,
  };
}

/** Sum of all flow amounts (also equals approximate total payroll when nothing is hidden). */
export function totalAmount(amounts: Record<FlowType, number>): number {
  return (Object.values(amounts) as number[]).reduce((s, v) => s + v, 0);
}
