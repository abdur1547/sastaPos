import { Injectable } from "@angular/core";
import { invoke, isTauri } from "@tauri-apps/api/core";

import { environment } from "../../../environments/environment";

export interface ReceiptConfig {
  readonly version: 1;
  readonly paperProfile: "58mm" | "80mm";
  readonly header: string;
  readonly footer: string;
  readonly showSku: boolean;
  readonly showBarcode: boolean;
  readonly showCustomer: boolean;
}

export interface ReceiptData {
  readonly invoiceNumber: string;
  readonly issuedAt: string;
  readonly currency: string;
  readonly customer: string | null;
  readonly items: readonly {
    readonly name: string;
    readonly sku: string | null;
    readonly barcode: string | null;
    readonly quantity: number;
    readonly unitPriceMinor: number;
  }[];
  readonly discountMinor: number;
  readonly taxMinor: number;
  readonly paidMinor: number;
  readonly isCopy: boolean;
}

export interface ReceiptLayout {
  readonly version: 1;
  readonly paperWidthMm: 58 | 80;
  readonly columns: 32 | 48;
  readonly lines: readonly string[];
}

@Injectable({ providedIn: "root" })
export class ReceiptGateway {
  preview(data: ReceiptData, config: ReceiptConfig): Promise<ReceiptLayout> {
    if (environment.production) {
      return Promise.reject(
        new Error(
          "Virtual receipt preview is available in development builds only.",
        ),
      );
    }
    if (!isTauri()) {
      return Promise.reject(
        new Error(
          "Open the Tauri desktop app to preview receipts. Browser rendering is not supported.",
        ),
      );
    }
    if (
      config.version !== 1 ||
      !["58mm", "80mm"].includes(config.paperProfile) ||
      [
        data.discountMinor,
        data.taxMinor,
        data.paidMinor,
        ...data.items.flatMap((item) => [item.quantity, item.unitPriceMinor]),
      ].some((value) => !Number.isSafeInteger(value) || value < 0)
    ) {
      return Promise.reject(
        new Error("Invalid receipt configuration or numeric input."),
      );
    }
    return invoke<ReceiptLayout>("receipt_preview", { data, config });
  }
}
