import { Injectable, signal } from "@angular/core";

@Injectable({ providedIn: "root" })
export class OnlineService {
  readonly online = signal(navigator.onLine);

  constructor() {
    window.addEventListener("online", () => this.online.set(true));
    window.addEventListener("offline", () => this.online.set(false));
  }

  requireOnline(): void {
    if (!this.online()) {
      throw new Error(
        "Store setup requires an internet connection. Reconnect to continue; nothing is queued offline.",
      );
    }
  }
}
