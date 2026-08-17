type Listener = () => void;

// Tracks whether the last API call succeeded. Anything that talks to the
// backend (bootstrap, the poll loop, a build/dispatch action) should report
// its outcome here so the UI can show a persistent warning instead of a
// silent console error or a toast that vanishes in 3 seconds.
class ConnectionStatus {
  private online = true;
  private listeners = new Set<Listener>();

  isOnline(): boolean {
    return this.online;
  }

  setOnline(value: boolean): void {
    if (this.online === value) return;
    this.online = value;
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const connectionStatus = new ConnectionStatus();
