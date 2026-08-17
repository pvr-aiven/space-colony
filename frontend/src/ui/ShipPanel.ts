import { store } from "../state/gameState";
import { applyOptimisticCost, rollback } from "../state/optimistic";
import { ApiError, buildShip, dispatchShip } from "../api/client";
import type { GameState } from "../types/api";

function formatEta(etaAt: string | null): string {
  if (!etaAt) return "";
  const remainingMs = new Date(etaAt).getTime() - Date.now();
  if (remainingMs <= 0) return "arriving...";
  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
}

export class ShipPanel {
  readonly el = document.createElement("div");
  private onError: (message: string) => void;
  private tickHandle: number;

  constructor(onError: (message: string) => void) {
    this.el.className = "build-menu";
    this.el.style.top = "auto";
    this.el.style.bottom = "16px";
    this.el.style.right = "16px";
    this.onError = onError;
    store.subscribe(() => this.render());
    this.render();
    // Re-render every second purely to tick down the ETA countdown text.
    this.tickHandle = window.setInterval(() => this.render(), 1000);
  }

  dispose(): void {
    window.clearInterval(this.tickHandle);
  }

  private render(): void {
    const state = store.getState();
    const catalog = store.getCatalog();
    if (!state || !catalog) return;

    const shipRows = catalog.ship_types.map((type) => {
      const tierOk = state.base.tier >= type.min_base_tier;
      const hasShipyard = state.buildings.some((b) => b.building_code === "shipyard" && b.status === "active");
      const affordable = Object.entries(type.base_cost).every(([code, amount]) => {
        const balance = state.resources.find((r) => r.resource_code === code);
        return Number(balance?.amount ?? 0) >= amount;
      });
      const disabled = !tierOk || !hasShipyard || !affordable;
      const costText = Object.entries(type.base_cost)
        .map(([code, amount]) => `${amount} ${code}`)
        .join(", ");
      return `
        <div class="item" data-ship-type="${type.code}">
          <div><div>${type.display_name}</div><div class="cost">${costText}${!hasShipyard ? " · needs shipyard" : ""}</div></div>
          <button ${disabled ? "disabled" : ""}>Build</button>
        </div>`;
    });

    const fleetRows = state.ships.map((ship) => {
      if (ship.status === "idle") {
        const options = catalog.sites
          .map((site) => `<option value="${site.id}">${site.display_name} (${site.travel_time_minutes}m)</option>`)
          .join("");
        return `
          <div class="item" data-ship-id="${ship.id}">
            <div>${ship.ship_code} · idle</div>
            <select class="site-select">${options}</select>
            <button data-dispatch="${ship.id}">Dispatch</button>
          </div>`;
      }
      return `<div class="item"><div>${ship.ship_code} · en route</div><div class="cost">${formatEta(ship.eta_at)}</div></div>`;
    });

    this.el.innerHTML = `
      <h3>Shipyard</h3>${shipRows.join("")}
      <h3>Fleet</h3>${fleetRows.join("") || '<div class="cost">No ships yet</div>'}
    `;

    this.el.querySelectorAll<HTMLElement>("[data-ship-type]").forEach((row) => {
      const btn = row.querySelector("button")!;
      btn.addEventListener("click", () => this.onBuildShip(row.dataset.shipType!));
    });

    this.el.querySelectorAll<HTMLButtonElement>("[data-dispatch]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest<HTMLElement>(".item")!;
        const select = row.querySelector<HTMLSelectElement>(".site-select")!;
        this.onDispatch(btn.dataset.dispatch!, select.value);
      });
    });
  }

  private async onBuildShip(shipType: string): Promise<void> {
    const catalog = store.getCatalog();
    const type = catalog?.ship_types.find((t) => t.code === shipType);
    if (!type) return;

    const snapshot = applyOptimisticCost(type.base_cost);
    try {
      const result = await buildShip(shipType);
      store.setState(result as unknown as GameState);
    } catch (err) {
      rollback(snapshot);
      this.handleError(err);
    }
  }

  private async onDispatch(shipId: string, siteId: string): Promise<void> {
    try {
      const result = await dispatchShip(shipId, siteId);
      store.setState(result as unknown as GameState);
    } catch (err) {
      this.handleError(err);
    }
  }

  private handleError(err: unknown): void {
    if (err instanceof ApiError) {
      if (err.state) store.setState(err.state);
      this.onError(err.message);
    } else {
      this.onError("Something went wrong");
    }
  }
}
