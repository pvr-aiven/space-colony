import { store } from "../state/gameState";
import { applyOptimisticCost, rollback } from "../state/optimistic";
import { isSiteRevealed, travelBlockedReason } from "../state/siteAccess";
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
  private pendingRender = false;

  constructor(onError: (message: string) => void) {
    this.el.className = "build-menu";
    this.el.style.top = "auto";
    this.el.style.bottom = "16px";
    this.el.style.right = "16px";
    this.onError = onError;
    store.subscribe(() => this.render());
    this.render();

    // Only the ETA countdown changes every second, so patch that text in place.
    // A full re-render here would replace the <select> element, and a native
    // dropdown closes the instant its element is swapped out — which made the
    // site picker impossible to use.
    //
    // This same tick also flushes any structural render deferred while the
    // dropdown was open. Polling for that rather than listening for focusout:
    // focusout isn't reliably dispatched for programmatic blur, and a
    // sub-second catch-up is imperceptible either way.
    this.tickHandle = window.setInterval(() => {
      this.tickEtas();
      if (this.pendingRender && !this.isInteracting()) {
        this.pendingRender = false;
        this.render();
      }
    }, 1000);
  }

  dispose(): void {
    window.clearInterval(this.tickHandle);
  }

  // An open native select keeps the element focused, so this is the closest
  // available signal for "the user is mid-interaction, don't rebuild the DOM".
  private isInteracting(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLSelectElement && this.el.contains(active);
  }

  private tickEtas(): void {
    const state = store.getState();
    if (!state) return;
    for (const ship of state.ships) {
      const node = this.el.querySelector<HTMLElement>(`[data-eta="${ship.id}"]`);
      if (node) node.textContent = formatEta(ship.eta_at);
    }
  }

  private render(): void {
    const state = store.getState();
    const catalog = store.getCatalog();
    if (!state || !catalog) return;

    if (this.isInteracting()) {
      this.pendingRender = true;
      return;
    }

    // Preserve each ship's chosen destination across re-renders — otherwise
    // every poll silently reset the picker to the first option, so a slow
    // selection could end up dispatching somewhere the player didn't pick.
    const previousSelection = new Map<string, string>();
    this.el.querySelectorAll<HTMLElement>("[data-ship-id]").forEach((row) => {
      const select = row.querySelector<HTMLSelectElement>(".site-select");
      if (select?.value) previousSelection.set(row.dataset.shipId!, select.value);
    });

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

    // Only revealed sites are offered at all; revealed-but-unreachable ones are
    // listed disabled with the reason, so the quantum gate has a visible payoff
    // rather than deep-space targets silently appearing later.
    const revealedSites = catalog.sites.filter((site) => isSiteRevealed(site, state));

    const fleetRows = state.ships.map((ship) => {
      if (ship.status === "idle") {
        const options = revealedSites
          .map((site) => {
            const blocked = travelBlockedReason(site, state);
            const label = blocked
              ? `${site.display_name} — ${blocked}`
              : `${site.display_name} (${site.travel_time_minutes}m)`;
            return `<option value="${site.id}" ${blocked ? "disabled" : ""}>${label}</option>`;
          })
          .join("");
        return `
          <div class="item" data-ship-id="${ship.id}">
            <div>${ship.ship_code} · idle</div>
            <select class="site-select">${options}</select>
            <button data-dispatch="${ship.id}">Dispatch</button>
          </div>`;
      }
      return `<div class="item"><div>${ship.ship_code} · en route</div><div class="cost" data-eta="${ship.id}">${formatEta(ship.eta_at)}</div></div>`;
    });

    this.el.innerHTML = `
      <h3>Shipyard</h3>${shipRows.join("")}
      <h3>Fleet</h3>${fleetRows.join("") || '<div class="cost">No ships yet</div>'}
    `;

    this.el.querySelectorAll<HTMLElement>("[data-ship-id]").forEach((row) => {
      const select = row.querySelector<HTMLSelectElement>(".site-select");
      const previous = previousSelection.get(row.dataset.shipId!);
      // Only restore if that option still exists and is still selectable.
      if (select && previous) {
        const match = select.querySelector<HTMLOptionElement>(`option[value="${previous}"]`);
        if (match && !match.disabled) select.value = previous;
      }
    });

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
