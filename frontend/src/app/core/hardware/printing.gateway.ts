import { Injectable, inject } from "@angular/core";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { environment } from "../../../environments/environment";
import { AuthService } from "../auth/auth.service";
import { ReceiptConfig, ReceiptLayout } from "./receipt.gateway";

export interface TerminalReceiptSettings {
  readonly config: ReceiptConfig;
  readonly autoPrint: boolean;
  readonly copyCount: number;
  readonly printer: "none" | "virtual";
  readonly virtualOutcome:
    "success" | "disconnected" | "write_failure" | "uncertain" | "interrupted";
}

export type PrintJobStatus =
  "pending" | "sending" | "virtual_output" | "failed_not_sent" | "uncertain";

export interface PrintAttempt {
  readonly id: number;
  readonly printer: string;
  readonly status: PrintJobStatus;
  readonly error: string | null;
  readonly layout: ReceiptLayout | null;
  readonly escpos: readonly number[] | null;
  readonly createdAt: string;
  readonly finishedAt: string | null;
}

export interface PrintJob {
  readonly id: string;
  readonly saleId: string;
  readonly invoiceNumber: string;
  readonly isCopy: boolean;
  readonly copyCount: number;
  readonly status: PrintJobStatus;
  readonly error: string | null;
  readonly createdAt: string;
  readonly attempts: readonly PrintAttempt[];
}

export interface ReceiptHistory {
  readonly receipts: readonly {
    readonly saleId: string;
    readonly invoiceNumber: string;
    readonly createdAt: string;
  }[];
  readonly jobs: readonly PrintJob[];
  readonly workerError: string | null;
}

@Injectable({ providedIn: "root" })
export class PrintingGateway {
  private readonly auth = inject(AuthService);

  async settings(): Promise<TerminalReceiptSettings> {
    this.requireDesktop();
    return invoke<TerminalReceiptSettings>("receipt_settings_get");
  }

  async saveSettings(settings: TerminalReceiptSettings): Promise<void> {
    this.requireDesktop();
    if (
      !Number.isInteger(settings.copyCount) ||
      settings.copyCount < 1 ||
      settings.copyCount > 5 ||
      (environment.production &&
        (settings.printer === "virtual" ||
          settings.virtualOutcome !== "success"))
    ) {
      throw new Error("Invalid copy count or unavailable development printer.");
    }
    return invoke<void>("receipt_settings_save", { settings });
  }

  async history(): Promise<ReceiptHistory> {
    return invoke<ReceiptHistory>("receipt_history", {
      storeId: this.requireStore(),
    });
  }

  async retry(jobId: string, confirmed = false): Promise<void> {
    if (!jobId) {
      throw new Error("A print job is required.");
    }
    return invoke<void>("receipt_retry", {
      storeId: this.requireStore(),
      jobId,
      confirmed,
    });
  }

  async reprint(saleId: string): Promise<void> {
    if (!saleId) {
      throw new Error("A saved sale is required.");
    }
    return invoke<void>("receipt_reprint", {
      storeId: this.requireStore(),
      saleId,
    });
  }

  private requireStore(): string {
    this.requireDesktop();
    const storeId = this.auth.user()?.storeId;
    if (!storeId) {
      throw new Error("Sign in to a store to manage receipts.");
    }
    return storeId;
  }

  private requireDesktop(): void {
    if (!isTauri()) {
      throw new Error("Open the Tauri desktop app to manage receipts.");
    }
  }
}
