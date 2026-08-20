import { store } from "../state/gameState";
import { applyOptimisticCost, rollback } from "../state/optimistic";
import { ApiError, upgradeBase } from "../api/client";
import type { GameState } from "../types/api";

// Sits ahead of the tier chip so the camera control reads as a view affordance
// rather than part of the base's stats. Title doubles as the discovery hint for
// the arrow keys, which have no other visible affordance.
const RECENTER_BUTTON = `
  <button id="recenter-btn" class="ghost" title="Recenter on the home planet (pan with the arrow keys)">
    ⌖ Recenter
  </button>`;

export class BasePanel {
  readonly el = document.createElement("div");
  private onError: (message: string) => void;
  private onRecenter: () => void;

  constructor(onError: (message: string) => void, onRecenter: () => void) {
    this.el.className = "resource-bar";
    this.el.style.top = "64px";
    this.onError = onError;
    this.onRecenter = onRecenter;
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const state = store.getState();
    const catalog = store.getCatalog();
    if (!state || !catalog) return;

    const nextTier = catalog.base_tiers.find((t) => t.tier === state.base.tier + 1);
    if (!nextTier || !nextTier.upgrade_cost) {
      this.el.innerHTML = `
        ${RECENTER_BUTTON}
        <div class="resource"><span class="code">base</span><span>Tier ${state.base.tier} (max)</span></div>`;
      this.bind();
      return;
    }

    const affordable = Object.entries(nextTier.upgrade_cost).every(([code, amount]) => {
      const balance = state.resources.find((r) => r.resource_code === code);
      return Number(balance?.amount ?? 0) >= amount;
    });
    const costText = Object.entries(nextTier.upgrade_cost)
      .map(([code, amount]) => `${amount} ${code}`)
      .join(", ");

    this.el.innerHTML = `
      ${RECENTER_BUTTON}
      <div class="resource"><span class="code">base</span><span>Tier ${state.base.tier}</span></div>
      <button id="upgrade-base-btn" ${affordable ? "" : "disabled"}>Upgrade to Tier ${nextTier.tier} (${costText})</button>
    `;
    this.bind();
  }

  // Both branches replace innerHTML wholesale, so listeners have to be
  // re-attached on every render, not just the first.
  private bind(): void {
    this.el.querySelector("#recenter-btn")?.addEventListener("click", (event) => {
      this.onRecenter();
      // Keeping focus would send subsequent arrow keys to the button, and a
      // focused button also keeps the pressed styling stuck on.
      (event.currentTarget as HTMLElement).blur();
    });
    this.el.querySelector("#upgrade-base-btn")?.addEventListener("click", () => this.onUpgrade());
  }

  private async onUpgrade(): Promise<void> {
    const state = store.getState();
    const catalog = store.getCatalog();
    const nextTier = catalog?.base_tiers.find((t) => t.tier === (state?.base.tier ?? 0) + 1);
    if (!nextTier?.upgrade_cost) return;

    const snapshot = applyOptimisticCost(nextTier.upgrade_cost);
    try {
      const result = await upgradeBase();
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
