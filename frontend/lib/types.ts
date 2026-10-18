export type View = "scout" | "saved" | "sales" | "activity";
export type Filter = "all" | "opportunities" | "review" | "excluded";
export type SpecKey =
  | "brand"
  | "gpu"
  | "bundle"
  | "lens"
  | "edition"
  | "vram_gb"
  | "lock_status"
  | "model"
  | "generation"
  | "variant"
  | "cpu"
  | "ram_gb"
  | "storage_gb"
  | "condition";
export type Facts = Partial<Record<SpecKey, string | number | null>>;
export interface Extraction {
  classification: string;
  category: Category;
  legacy?: boolean;
  status: "eligible" | "rejected" | "needs_review";
  facts: Facts;
  evidence: Partial<Record<SpecKey, string>>;
  errors?: string[];
  unknown_fields?: string[];
  reason: string;
  engine?: string;
  cached?: boolean;
  stats?: { elapsed_seconds: number; eval_count?: number };
}
export interface Settings {
  query: string;
  max_price: number;
  min_margin: number;
  fee_rate: number;
  fixed_fee: number;
  fee_base: "receipts" | "item";
  packaging: number;
  repairs: number;
  outbound_shipping: number;
  resale_shipping: number;
  risk_allowance: number;
  labour: number;
  assumed_resale: number | null;
  recency_days: number;
  pickup_cost?: number | null;
}
export type Category =
  "laptop" | "camera" | "phone" | "tablet" | "console" | "gpu" | "other";
export type MarketplaceSource = "ebay" | "facebook";
export interface SearchLocation {
  latitude: number;
  longitude: number;
  label: string;
}
export interface Watchlist extends Settings {
  sources: MarketplaceSource[];
  location: SearchLocation | null;
  radius_km: number;
  pickup_cost: number | null;
  id: number;
  name: string;
  category: Category;
  enabled: boolean;
  archived: boolean;
}
export interface Comparison {
  category?: Category;
  brand?: string;
  bundle?: string;
  lens?: string;
  external_id: string;
  source: string;
  reference: string;
  sold_at: string;
  collected_at: string;
  model: string;
  generation: string | number | null;
  variant: string;
  cpu: string;
  ram_gb: number;
  storage_gb: number;
  condition: string;
  condition_evidence: string;
  sold_price: number;
  shipping: number;
  synthetic: boolean;
}
export interface Scenario {
  resale: number;
  receipts: number;
  cash_invested: number;
  fees: number;
  margin: number;
  roi: number | null;
}
export interface Valuation {
  method:
    | "unavailable"
    | "verified_comparisons"
    | "synthetic_comparisons"
    | "user_assumption";
  comparisons: Comparison[];
  count: number;
  scenarios: Record<string, Scenario | null>;
  opportunity: boolean;
  reason: string;
  costs: Settings;
  valued_at: string;
  watchlist_id?: number | null;
  range?: Record<string, number>;
}
export interface Listing {
  id: number;
  external_id: string;
  marketplace: string;
  latitude?: number;
  longitude?: number;
  location_label?: string;
  location_is_precise?: boolean;
  distance_by_watchlist?: Record<string, number | null>;
  display_distance_km?: number | null;
  title: string;
  description: string;
  url: string | null;
  asking_price: number;
  inbound_shipping: number | null;
  synthetic: boolean;
  location_basis?: string;
  extraction: Extraction;
  valuation: Valuation;
  valuations: Record<string, Valuation>;
  watchlist_ids: number[];
  display_watchlist_id: number | null;
  watchlist_names?: string[];
  valuation_source?: string;
  decision: string;
  first_seen: string;
  last_seen: string;
  correction?: string | null;
  observations: {
    observed_at: string;
    asking_price: number;
    shipping: number | null;
  }[];
}
export interface Job {
  kind: string;
  phase?: string;
  searches?: {
    watchlist_id: number;
    source?: MarketplaceSource;
    name: string;
    query: string;
    status: string;
    requests: number;
    admitted: number;
    error?: string;
  }[];
  status: "running" | "completed" | "partial" | "failed";
  started_at: string;
  finished_at?: string;
  processed: number;
  total: number;
  errors: string[];
  skipped: { title: string; reason: string }[];
  requests: number;
  message: string;
  elapsed_seconds?: number;
}
export interface Workspace {
  mode: "local";
  watchlists: Watchlist[];
  settings: Settings;
  listings: Listing[];
  comparisons: Comparison[];
  scans: Job[];
  job: Job | null;
  health: {
    available: boolean;
    model: string;
    message?: string;
    serpapi_configured: boolean;
    facebook_configured: boolean;
  };
  counts: {
    scanned: number;
    excluded: number;
    review: number;
    opportunities: number;
  };
  csrf_token: string;
}
export type Mutation = (
  path: string,
  data?: unknown,
  message?: string,
) => Promise<void>;
