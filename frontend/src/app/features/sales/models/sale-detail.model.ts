import { PaymentMethod, SaleStatus, SaleType } from "./sale-register.model";

export interface SaleDetailHeader {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly status: SaleStatus;
  readonly saleType: SaleType;
  readonly soldAt: Date;
  readonly currencyCode: string;
  readonly subtotal: string;
  readonly discountAmount: string;
  readonly taxAmount: string;
  readonly totalAmount: string;
  readonly totalPaid: string;
  readonly remaining: string;
  readonly description: string | null;
  readonly customer: {
    readonly id: string;
    readonly name: string;
    readonly phoneNumber: string | null;
  } | null;
  readonly cashier: { readonly id: string; readonly name: string | null };
  readonly voided: {
    readonly reason: string;
    readonly at: Date | null;
    readonly byName: string | null;
  } | null;
}

export interface SaleDetailItem {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly sku: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly taxRate: string;
  readonly lineTotal: string;
}

export interface SaleDetailPayment {
  readonly id: string;
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string | null;
  readonly createdAt: Date | null;
}

export interface SaleStockMovement {
  readonly id: string;
  readonly type: string;
  readonly productName: string | null;
  readonly quantity: string;
  readonly quantityBefore: string;
  readonly quantityAfter: string;
  readonly description: string | null;
  readonly createdAt: Date | null;
}

export interface SaleLedgerEntry {
  readonly id: string;
  readonly direction: "DEBIT" | "CREDIT";
  readonly type: string;
  readonly amount: string;
  readonly description: string | null;
  readonly createdAt: Date | null;
}

/** Everything the read-only sale document shows, including its audit trail. */
export interface SaleDetail {
  readonly header: SaleDetailHeader;
  readonly items: readonly SaleDetailItem[];
  readonly payments: readonly SaleDetailPayment[];
  readonly stockMovements: readonly SaleStockMovement[];
  readonly ledgerEntries: readonly SaleLedgerEntry[];
}
