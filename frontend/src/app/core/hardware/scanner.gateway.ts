import { Injectable } from "@angular/core";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { environment } from "../../../environments/environment";

export type ScannerEvent =
  | {
      readonly type: "scan";
      readonly sessionId: string;
      readonly scanId: string;
      readonly barcode: string;
    }
  | {
      readonly type: "error";
      readonly sessionId: string;
      readonly message: string;
    };

export interface ScannerSimulation {
  sendChunk(chunk: string): Promise<void>;
  close(): Promise<void>;
}

@Injectable({ providedIn: "root" })
export class ScannerGateway {
  async openSimulator(
    onEvent: (event: ScannerEvent) => void,
  ): Promise<ScannerSimulation> {
    if (environment.production) {
      throw new Error(
        "Scanner simulation is available in development builds only.",
      );
    }
    if (!isTauri()) {
      throw new Error(
        "Open the Tauri desktop app to test scans. Browser-only simulation is not supported.",
      );
    }

    let sessionId: string | null = null;
    let closed = false;
    const unlisten = await getCurrentWebviewWindow().listen<ScannerEvent>(
      "hardware://simulated-scan",
      ({ payload }) => {
        if (!closed && payload.sessionId === sessionId) {
          onEvent(payload);
        }
      },
    );

    try {
      sessionId = await invoke<string>("scanner_simulator_start");
    } catch (error) {
      unlisten();
      throw error;
    }

    const activeSessionId = sessionId;
    return {
      sendChunk: (chunk) => {
        if (closed) {
          return Promise.reject(
            new Error("Scanner simulator session is closed."),
          );
        }
        return invoke<void>("scanner_simulator_feed", {
          sessionId: activeSessionId,
          chunk,
        });
      },
      close: async () => {
        if (closed) {
          return;
        }
        closed = true;
        unlisten();
        await invoke<void>("scanner_simulator_stop", {
          sessionId: activeSessionId,
        });
      },
    };
  }
}
