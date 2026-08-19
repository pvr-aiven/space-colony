import type { GameState, Site } from "../types/api";

// Site gating rules live here rather than in the scene and the UI separately,
// so a site can't render as reachable in 3D while the dispatch panel says
// otherwise. The backend re-checks travel on dispatch regardless — this is
// presentation only.

export function hasActiveBuilding(state: GameState | null, buildingCode: string): boolean {
  if (!state) return false;
  return state.buildings.some((b) => b.building_code === buildingCode && b.status === "active");
}

// A revealed site is drawn in the scene and listed in the dispatch dropdown.
export function isSiteRevealed(site: Site, state: GameState | null): boolean {
  if (!site.reveal_requires) return true;
  return hasActiveBuilding(state, site.reveal_requires);
}

// A travelable site can actually be dispatched to. Deliberately separate from
// reveal: seeing a deep-space target you can't reach yet is the hook that
// makes the quantum gate worth building.
export function isSiteTravelable(site: Site, state: GameState | null): boolean {
  if (!site.travel_requires) return true;
  return hasActiveBuilding(state, site.travel_requires);
}

// Human-readable reason a revealed site still can't be reached, for the UI.
export function travelBlockedReason(site: Site, state: GameState | null): string | null {
  if (isSiteTravelable(site, state)) return null;
  return `needs ${site.travel_requires!.replace(/_/g, " ")}`;
}
