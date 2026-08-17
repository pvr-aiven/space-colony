import { connectionStatus } from "../state/connection";

export class ConnectionBanner {
  readonly el = document.createElement("div");

  constructor() {
    this.el.className = "connection-banner";
    this.el.textContent = "⚠ Can't reach the backend — retrying…";
    connectionStatus.subscribe(() => this.render());
    this.render();
  }

  private render(): void {
    this.el.style.display = connectionStatus.isOnline() ? "none" : "flex";
  }
}
