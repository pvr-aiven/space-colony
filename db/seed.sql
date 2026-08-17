-- Static game catalog: resource/building/ship types and the fixed set of
-- explorable sites. Idempotent — safe to re-run against an empty DB.

INSERT INTO resource_types (code, display_name, is_currency) VALUES
    ('metal', 'Metal', false),
    ('ice', 'Ice', false),
    ('energy', 'Energy', false),
    ('rare_isotopes', 'Rare Isotopes', false),
    ('unlock_tokens', 'Unlock Tokens', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO building_types (code, display_name, max_level, min_base_tier, base_cost, cost_growth_factor, production, unlocks_building_code) VALUES
    ('solar_array',   'Solar Array',    3, 1, '{"metal": 40}',                     1.5, '{"resource": "energy", "rate_per_hour": 10}', NULL),
    ('mining_rig',    'Mining Rig',     3, 1, '{"metal": 20, "energy": 10}',       1.5, '{"resource": "metal", "rate_per_hour": 15}',  NULL),
    ('ice_extractor', 'Ice Extractor',  3, 1, '{"metal": 30, "energy": 10}',       1.5, '{"resource": "ice", "rate_per_hour": 12}',    NULL),
    ('shipyard',      'Shipyard',       2, 1, '{"metal": 80, "ice": 20}',          1.6, NULL,                                          NULL),
    ('sensor_array',  'Sensor Array',   2, 2, '{"metal": 60, "energy": 40}',       1.6, NULL,                                          'refinery'),
    ('refinery',      'Refinery',       3, 2, '{"metal": 120, "ice": 40}',         1.7, '{"resource": "rare_isotopes", "rate_per_hour": 3}', NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO ship_types (code, display_name, min_base_tier, base_cost, cargo_capacity, speed_factor) VALUES
    ('scout',         'Scout',          1, '{"metal": 50, "energy": 20}',                 8,  1.5),
    ('freighter',     'Freighter',      1, '{"metal": 120, "ice": 30, "energy": 30}',      25, 1.0),
    ('heavy_cruiser',  'Heavy Cruiser',  2, '{"metal": 300, "ice": 80, "rare_isotopes": 10}', 40, 0.75)
ON CONFLICT (code) DO NOTHING;

INSERT INTO sites (code, display_name, kind, difficulty, risk_pct, travel_time_minutes, yield_table, position) VALUES
    ('asteroid_belt_alpha', 'Asteroid Belt Alpha', 'asteroid', 1, 0.05, 5,
        '{"metal": [20, 40], "ice": [5, 15]}',
        '{"x": 12, "y": 0, "z": 4}'),
    ('ice_moon', 'Frostback Moon', 'planet', 1, 0.10, 8,
        '{"ice": [25, 50], "rare_isotopes": [0, 3]}',
        '{"x": -10, "y": 1, "z": 10}'),
    ('derelict_station', 'Derelict Station Kessel', 'derelict', 2, 0.20, 12,
        '{"metal": [15, 30], "rare_isotopes": [3, 8], "unlock_tokens": [1, 2]}',
        '{"x": 18, "y": -2, "z": -14}'),
    ('volatile_nebula', 'Volatile Nebula', 'asteroid', 3, 0.30, 15,
        '{"rare_isotopes": [5, 12], "energy": [10, 25], "unlock_tokens": [1, 3]}',
        '{"x": -22, "y": 3, "z": -6}'),
    ('ancient_ruins', 'Ancient Ruins', 'derelict', 4, 0.35, 20,
        '{"rare_isotopes": [8, 18], "unlock_tokens": [2, 5]}',
        '{"x": 0, "y": -1, "z": 28}')
ON CONFLICT (code) DO NOTHING;
