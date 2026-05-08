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
  lads: LadData[];
}
