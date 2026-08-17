-- Space Colony schema. One player = one session = one base for this scope.
-- Run once against a fresh Aiven for PostgreSQL database, then db/seed.sql.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============ core session/player ============
CREATE TABLE IF NOT EXISTS sessions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_token   uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    display_name    text NOT NULL DEFAULT 'Commander',
    created_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bases (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name            text NOT NULL DEFAULT 'Home Base',
    tier            int  NOT NULL DEFAULT 1,
    build_slots     int  NOT NULL DEFAULT 4,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Progression tiers: each row past tier 1 is a base upgrade a player can
-- buy with unlock_tokens, raising bases.tier and bases.build_slots and
-- unlocking building_types/ship_types gated on that min_base_tier.
CREATE TABLE IF NOT EXISTS base_tiers (
    tier            int PRIMARY KEY,
    build_slots     int NOT NULL,
    upgrade_cost    jsonb -- cost to reach this tier from the previous one; NULL for tier 1 (starting tier)
);

-- ============ resources / inventory ============
CREATE TABLE IF NOT EXISTS resource_types (
    code            text PRIMARY KEY,
    display_name    text NOT NULL,
    is_currency     boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS resource_balances (
    base_id             uuid NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    resource_code       text NOT NULL REFERENCES resource_types(code),
    amount              numeric NOT NULL DEFAULT 0 CHECK (amount >= 0),
    last_collected_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (base_id, resource_code)
);

-- ============ buildings ============
CREATE TABLE IF NOT EXISTS building_types (
    code                    text PRIMARY KEY,
    display_name            text NOT NULL,
    max_level               int   NOT NULL DEFAULT 3,
    min_base_tier           int   NOT NULL DEFAULT 1,
    base_cost               jsonb NOT NULL,
    cost_growth_factor      numeric NOT NULL DEFAULT 1.5,
    production              jsonb,
    unlocks_building_code   text REFERENCES building_types(code)
);

CREATE TABLE IF NOT EXISTS buildings (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_id         uuid NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    building_code   text NOT NULL REFERENCES building_types(code),
    level           int  NOT NULL DEFAULT 1,
    status          text NOT NULL DEFAULT 'active' CHECK (status IN ('constructing', 'active')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ ships ============
CREATE TABLE IF NOT EXISTS ship_types (
    code            text PRIMARY KEY,
    display_name    text NOT NULL,
    min_base_tier   int NOT NULL DEFAULT 1,
    base_cost       jsonb NOT NULL,
    cargo_capacity  int NOT NULL DEFAULT 10,
    speed_factor    numeric NOT NULL DEFAULT 1.0
);

-- ============ explorable sites (fixed set of 3-5, seeded at deploy) ============
CREATE TABLE IF NOT EXISTS sites (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code                text NOT NULL UNIQUE,
    display_name        text NOT NULL,
    kind                text NOT NULL,
    difficulty          int  NOT NULL DEFAULT 1,
    risk_pct            numeric NOT NULL DEFAULT 0.1,
    travel_time_minutes int NOT NULL DEFAULT 5,
    yield_table         jsonb NOT NULL,
    position            jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS ships (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_id         uuid NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    ship_code       text NOT NULL REFERENCES ship_types(code),
    name            text,
    status          text NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'en_route', 'returning', 'lost')),
    current_site_id uuid REFERENCES sites(id),
    departed_at     timestamptz,
    eta_at          timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============ expedition/event log ============
CREATE TABLE IF NOT EXISTS expeditions (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    base_id             uuid NOT NULL REFERENCES bases(id) ON DELETE CASCADE,
    ship_id             uuid NOT NULL REFERENCES ships(id),
    site_id             uuid NOT NULL REFERENCES sites(id),
    departed_at         timestamptz NOT NULL DEFAULT now(),
    resolved_at         timestamptz,
    outcome             text CHECK (outcome IN ('success', 'partial', 'failed')),
    resources_gained    jsonb,
    log_message         text
);

CREATE INDEX IF NOT EXISTS idx_expeditions_base ON expeditions(base_id, departed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ships_base ON ships(base_id);
CREATE INDEX IF NOT EXISTS idx_buildings_base ON buildings(base_id);

-- This script runs as the service admin (avnadmin), which owns every table
-- above. Postgres 15+ no longer grants CREATE on schema public by default,
-- and table privileges never carry over to a role that isn't the owner, so
-- the app's own service user (created separately via Terraform) needs an
-- explicit grant here — otherwise every query it runs fails with
-- "permission denied for schema public" or "for table ...".
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT USAGE ON SCHEMA public TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO app_runtime;
  END IF;
END $$;
