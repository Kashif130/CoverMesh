export type Adapter = "WEATHER" | "PRICE_THRESHOLD" | "NEWS_EVENT";

export interface PerilType {
  id: string;
  name: string;
  adapter: Adapter;
  description: string;
  min_independent_sources: number;
  max_payout_fraction_bps: number;
  premium_rate_bps: number;
  active: boolean;
}

export interface PoolSummary {
  admin: string;
  pool_nav: string;
  total_shares: string;
  reserved_liability: string;
  available_capacity: string;
  share_price_wei_per_1e18_shares: string;
  cover_count: number;
  keeper_reward_wei: string;
  max_utilization_bps: string;
  withdrawal_lockup_seconds: string;
}

export interface Cover {
  id: string;
  beneficiary: string;
  peril_type_id: string;
  subject: string;
  keywords: string;
  location_lat: string;
  location_lon: string;
  threshold_metric: string;
  threshold_comparator: string;
  threshold_value: string;
  asset_id: string;
  allowed_outcomes: string[];
  triggering_outcomes: string[];
  window_start: string;
  window_end: string;
  coverage_amount: string;
  premium_paid: string;
  created_at: string;
  resolved: boolean;
  resolution_status: "" | "TRIGGERED" | "NOT_TRIGGERED" | "INSUFFICIENT_EVIDENCE" | "EXPIRED_VOID";
  extracted_reading: string;
  payout_amount: string;
  rationale: string;
  source_a_summary: string;
  source_b_summary: string;
  source_c_summary: string;
  last_check_at: string;
  check_attempts: number;
  resolved_at: string;
}

export interface LPPositionView {
  owner: string;
  shares: number;
  value_wei: string;
  pending_withdrawal: {
    shares: number;
    requested_at: string;
    unlock_at: string;
  } | null;
}

export const WEATHER_METRICS = [
  "precipitation_mm",
  "temperature_max_c",
  "temperature_min_c",
  "wind_speed_max_kmh",
] as const;
