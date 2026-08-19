export interface ResourceBalance {
  resource_code: string;
  amount: string;
}

export interface Building {
  id: string;
  base_id: string;
  building_code: string;
  level: number;
  status: "constructing" | "active";
}

export interface Ship {
  id: string;
  base_id: string;
  ship_code: string;
  name: string | null;
  status: "idle" | "en_route" | "returning" | "lost";
  current_site_id: string | null;
  departed_at: string | null;
  eta_at: string | null;
}

export interface ExpeditionLogEntry {
  id: string;
  ship_id: string;
  site_id: string;
  departed_at: string;
  resolved_at: string | null;
  outcome: "success" | "partial" | "failed" | null;
  resources_gained: Record<string, number> | null;
  log_message: string | null;
}

export interface Base {
  id: string;
  session_id: string;
  name: string;
  tier: number;
  build_slots: number;
}

export interface GameState {
  session: { display_name: string };
  base: Base;
  resources: ResourceBalance[];
  buildings: Building[];
  ships: Ship[];
  log: ExpeditionLogEntry[];
}

export interface Site {
  id: string;
  code: string;
  display_name: string;
  /** `asteroid` | `planet` | `derelict` | `deep_planet` */
  kind: string;
  difficulty: number;
  risk_pct: string;
  travel_time_minutes: number;
  yield_table: Record<string, [number, number]>;
  /** Scene-space coordinates — used directly, no scaling applied. */
  position: { x: number; y: number; z: number };
  /** Building required for the site to be visible at all; null = always visible. */
  reveal_requires: string | null;
  /** Building required to dispatch there; null = no requirement. */
  travel_requires: string | null;
}

export interface BuildingType {
  code: string;
  display_name: string;
  max_level: number;
  min_base_tier: number;
  base_cost: Record<string, number>;
  cost_growth_factor: string;
  production: { resource: string; rate_per_hour: number } | null;
  unlocks_building_code: string | null;
}

export interface ShipType {
  code: string;
  display_name: string;
  min_base_tier: number;
  base_cost: Record<string, number>;
  cargo_capacity: number;
  speed_factor: string;
}

export interface BaseTier {
  tier: number;
  build_slots: number;
  upgrade_cost: Record<string, number> | null;
}

export interface Catalog {
  resource_types: { code: string; display_name: string; is_currency: boolean }[];
  building_types: BuildingType[];
  ship_types: ShipType[];
  sites: Site[];
  base_tiers: BaseTier[];
}

export interface ApiErrorPayload {
  error: string;
  message: string;
  state?: GameState;
}
