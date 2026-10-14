import { Injectable } from "@angular/core";

import { ScannerEvent } from "./scanner.gateway";

export interface ScanConsumer {
  receive(event: ScannerEvent): void;
  release(): void;
}

/** Routes records to one active consumer without buffering suspended scans. */
@Injectable({ providedIn: "root" })
export class ScanConsumerService {
  private active: ScanConsumer | null = null;

  activate(
    onBarcode: (barcode: string) => void,
    onError: (message: string) => void,
  ): ScanConsumer {
    const seen = new Set<string>();
    const consumer: ScanConsumer = {
      receive: (event) => {
        if (this.active !== consumer) {
          return;
        }
        if (event.type === "error") {
          onError(event.message);
          return;
        }
        const key = JSON.stringify([event.sessionId, event.scanId]);
        if (!seen.has(key)) {
          seen.add(key);
          onBarcode(event.barcode);
        }
      },
      release: () => {
        if (this.active === consumer) {
          this.active = null;
        }
        seen.clear();
      },
    };
    this.active = consumer;
    return consumer;
  }
}
