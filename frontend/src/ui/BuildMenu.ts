import { store } from "../state/gameState";
import { applyOptimisticCost, rollback } from "../state/optimistic";
import { ApiError, buildBuilding, upgradeBuilding } from "../api/client";
import type { BuildingType, GameState } from "../types/api";

function costForNextLevel(type: BuildingType, currentLevel: number): Record<string, number> {
  const factor = Number(type.cost_growth_factor) ** currentLevel;
  const cost: Record<string, number> = {};
  for (const [code, amount] of Object.entries(type.base_cost)) {
    cost[code] = Math.ceil(amount * factor);
  }
  return cost;
}

function canAfford(cost: Record<string, number>): boolean {
  const state = store.getState();
  if (!state) return false;
  return Object.entries(cost).every(([code, amount]) => {
    const balance = state.resources.find((r) => r.resource_code === code);
    return Number(balance?.amount ?? 0) >= amount;
  });
}

export class BuildMenu {
  readonly el = document.createElement("div");
  private onError: (message: string) => void;

  constructor(onError: (message: string) => void) {
    this.el.className = "build-menu";
    this.onError = onError;
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const state = store.getState();
    const catalog = store.getCatalog();
    if (!state || !catalog) return;

    const rows = catalog.building_types.map((type) => {
      const existing = state.buildings.find((b) => b.building_code === type.code);
      const tierOk = state.base.tier >= type.min_base_tier;
      const atMaxLevel = existing && existing.level >= type.max_level;
      const cost = costForNextLevel(type, existing?.level ?? 0);
      const affordable = canAfford(cost);
      const noSlots = !existing && state.buildings.length >= state.base.build_slots;
      const disabled = !tierOk || atMaxLevel || !affordable || noSlots;

      const label = existing ? `${type.display_name} (Lv.${existing.level})` : type.display_name;
      const actionLabel = existing ? "Upgrade" : "Build";
      const costText = Object.entries(cost)
        .map(([code, amount]) => `${amount} ${code}`)
        .join(", ");

      return `
        <div class="item" data-code="${type.code}" data-existing="${existing ? existing.id : ""}">
          <div>
            <div>${label}</div>
            <div class="cost">${atMaxLevel ? "max level" : costText}${noSlots ? " · no slots" : ""}${!tierOk ? ` · needs tier ${type.min_base_tier}` : ""}</div>
          </div>
          <button ${disabled ? "disabled" : ""}>${actionLabel}</button>
        </div>`;
    });

    this.el.innerHTML = `<h3>Buildings</h3>${rows.join("")}`;

    this.el.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
      const row = btn.closest<HTMLElement>(".item");
      if (!row) return;
      btn.addEventListener("click", () => this.onAction(row.dataset.code!, row.dataset.existing || null));
    });
  }

  private async onAction(code: string, existingId: string | null): Promise<void> {
    const catalog = store.getCatalog();
    const state = store.getState();
    if (!catalog || !state) return;
    const type = catalog.building_types.find((t) => t.code === code);
    if (!type) return;

    const existing = state.buildings.find((b) => b.building_code === code);
    const cost = costForNextLevel(type, existing?.level ?? 0);
    const snapshot = applyOptimisticCost(cost);

    try {
      const result = existingId ? await upgradeBuilding(existingId) : await buildBuilding(code);
      store.setState(result as unknown as GameState);
    } catch (err) {
      rollback(snapshot);
      if (err instanceof ApiError) {
        if (err.state) store.setState(err.state);
        this.onError(err.message);
      } else {
        this.onError("Something went wrong");
      }
    }
  }
}
