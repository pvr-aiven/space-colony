import { store } from "../state/gameState";

export class ResourceBar {
  readonly el = document.createElement("div");

  constructor() {
    this.el.className = "resource-bar";
    store.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    const state = store.getState();
    if (!state) return;
    this.el.innerHTML = state.resources
      .map(
        (r) =>
          `<div class="resource"><span class="code">${r.resource_code}</span><span>${Math.floor(Number(r.amount))}</span></div>`,
      )
      .join("");
  }
}
