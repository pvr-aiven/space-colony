import { store } from "../state/gameState";
import { applyOptimisticCost, rollback } from "../state/optimistic";
import { ApiError, upgradeBase } from "../api/client";
import type { GameState } from "../types/api";

export class BasePanel {
  readonly el = document.createElement("div");
  private onError: (message: string) => void;

  constructor(onError: (message: string) => void) {
    this.el.className = "resource-bar";
    this.el.style.top = "64px";
    this.onError = onError;
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const state = store.getState();
    const catalog = store.getCatalog();
    if (!state || !catalog) return;

    const nextTier = catalog.base_tiers.find((t) => t.tier === state.base.tier + 1);
    if (!nextTier || !nextTier.upgrade_cost) {
      this.el.innerHTML = `<div class="resource"><span class="code">base</span><span>Tier ${state.base.tier} (max)</span></div>`;
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
      <div class="resource"><span class="code">base</span><span>Tier ${state.base.tier}</span></div>
      <button id="upgrade-base-btn" ${affordable ? "" : "disabled"}>Upgrade to Tier ${nextTier.tier} (${costText})</button>
    `;
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
