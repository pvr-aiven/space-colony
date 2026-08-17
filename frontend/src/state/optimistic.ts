import type { GameState } from "../types/api";
import { store } from "./gameState";

// Applies a resource-cost deduction + a placeholder row locally, before the
// server round-trip confirms it. Returns the pre-mutation snapshot so the
// caller can roll back on a rejected request (see ApiError.state for the
// authoritative replacement instead, which is preferred when available).
export function applyOptimisticCost(cost: Record<string, number>): GameState | null {
  const current = store.getState();
  if (!current) return null;

  const snapshot: GameState = structuredClone(current);

  const next: GameState = structuredClone(current);
  next.resources = next.resources.map((r) => {
    const spend = cost[r.resource_code];
    if (!spend) return r;
    return { ...r, amount: String(Number(r.amount) - spend) };
  });
  store.setState(next);

  return snapshot;
}

export function rollback(snapshot: GameState | null): void {
  if (snapshot) store.setState(snapshot);
}
