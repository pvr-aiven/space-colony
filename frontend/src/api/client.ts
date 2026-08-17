import type { ApiErrorPayload, Catalog, GameState } from "../types/api";

const TOKEN_KEY = "space-colony:session_token";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public state?: GameState,
  ) {
    super(message);
  }
}

function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: options.body ? { "Content-Type": "application/json", ...options.headers } : options.headers,
  });
  const body = await res.json();
  if (!res.ok) {
    const err = body as ApiErrorPayload;
    throw new ApiError(err.error, err.message, err.state);
  }
  return body as T;
}

// Reuses a session_token stored in localStorage if present, otherwise
// starts a fresh game — this is what makes "close tab, reopen" resume work.
export async function loadOrCreateSession(): Promise<GameState> {
  const existing = getStoredToken();
  if (existing) {
    try {
      return await request<GameState>(`/sessions/${existing}/state`);
    } catch {
      // stored token is stale/invalid — fall through to creating a new session.
    }
  }
  const created = await request<{ session_token: string } & GameState>("/sessions", { method: "POST" });
  storeToken(created.session_token);
  return created;
}

export function getState(): Promise<GameState> {
  return request<GameState>(`/sessions/${getStoredToken()}/state`);
}

export function collectResources(): Promise<{ resources: GameState["resources"] }> {
  return request(`/sessions/${getStoredToken()}/collect`, { method: "POST" });
}

export function getCatalog(): Promise<Catalog> {
  return request<Catalog>("/meta/catalog");
}

export function buildBuilding(buildingType: string): Promise<{ building: unknown } & GameState> {
  return request(`/sessions/${getStoredToken()}/buildings`, {
    method: "POST",
    body: JSON.stringify({ building_type: buildingType }),
  });
}

export function upgradeBuilding(buildingId: string): Promise<{ building: unknown } & GameState> {
  return request(`/sessions/${getStoredToken()}/buildings/${buildingId}/upgrade`, { method: "POST" });
}

export function buildShip(shipType: string): Promise<{ ship: unknown } & GameState> {
  return request(`/sessions/${getStoredToken()}/ships`, {
    method: "POST",
    body: JSON.stringify({ ship_type: shipType }),
  });
}

export function dispatchShip(shipId: string, siteId: string): Promise<{ ship: unknown } & GameState> {
  return request(`/sessions/${getStoredToken()}/ships/${shipId}/dispatch`, {
    method: "POST",
    body: JSON.stringify({ site_id: siteId }),
  });
}

export function upgradeBase(): Promise<GameState> {
  return request(`/sessions/${getStoredToken()}/base/upgrade`, { method: "POST" });
}
