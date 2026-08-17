import { store } from "../state/gameState";

export class MissionLog {
  readonly el = document.createElement("div");

  constructor() {
    this.el.className = "build-menu";
    this.el.style.top = "auto";
    this.el.style.bottom = "16px";
    this.el.style.left = "16px";
    this.el.style.right = "auto";
    this.el.style.width = "320px";
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const state = store.getState();
    if (!state) return;

    const rows = state.log
      .filter((entry) => entry.resolved_at)
      .slice(0, 8)
      .map((entry) => {
        const gains = entry.resources_gained
          ? Object.entries(entry.resources_gained)
              .map(([code, amount]) => `+${amount} ${code}`)
              .join(", ")
          : "";
        return `<div class="item"><div><div>${entry.log_message}</div><div class="cost">${gains}</div></div></div>`;
      });

    this.el.innerHTML = `<h3>Mission Log</h3>${rows.join("") || '<div class="cost">No expeditions yet</div>'}`;
  }
}
