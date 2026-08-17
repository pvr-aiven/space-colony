import type { Catalog, GameState } from "../types/api";

type Listener = () => void;

// Single client-side store. The server is authoritative for anything
// persisted — this just holds the last-known snapshot plus optimistic
// tweaks, and notifies subscribers (UI panels, scene) on any change.
class GameStore {
  private state: GameState | null = null;
  private catalog: Catalog | null = null;
  private listeners = new Set<Listener>();

  getState(): GameState | null {
    return this.state;
  }

  getCatalog(): Catalog | null {
    return this.catalog;
  }

  setState(state: GameState): void {
    this.state = state;
    this.emit();
  }

  setCatalog(catalog: Catalog): void {
    this.catalog = catalog;
    this.emit();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const store = new GameStore();
