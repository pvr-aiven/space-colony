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

// The next thing standing between the player and this destination, walking the
// chain: you need the sensor array before the quantum gate is any use, so name
// whichever is missing first. Returning a reason for *unrevealed* sites too is
// deliberate — a destination that silently vanishes from the list gives the
// player no way to tell "doesn't exist" from "prerequisite missing".
export function siteBlockedReason(site: Site, state: GameState | null): string | null {
  const label = (code: string) => code.replace(/_/g, " ");
  if (site.reveal_requires && !hasActiveBuilding(state, site.reveal_requires)) {
    return `needs ${label(site.reveal_requires)}`;
  }
  if (site.travel_requires && !hasActiveBuilding(state, site.travel_requires)) {
    return `needs ${label(site.travel_requires)}`;
  }
  return null;
}
