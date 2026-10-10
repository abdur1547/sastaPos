/** Contracts mirror the backend's sale DTOs (docs/use-cases.md 5-5b). */
export type SaleType = 'DEBIT' | 'CREDIT';
export type SaleStatus = 'COMPLETED' | 'IN_PROGRESS' | 'VOIDED';
/** CREDIT is derived by the system and never accepted as input. */
export type PaymentMethod = 'CASH' | 'BANK';

export interface SaleItemRequest {
  readonly productId: string;
  readonly quantity: string;
  /** Client-computed unit price x quantity (before tax); only used to detect stale prices. */
  readonly itemTotal: string;
}

export interface SalePaymentRequest {
  readonly amount: string;
  readonly method: PaymentMethod;
  readonly referenceNumber: string | null;
  readonly description: string | null;
}

export interface SaleRequest {
  /** Set when an existing draft is being replaced or finalised. */
  readonly saleId: string | null;
  readonly saleType: SaleType;
  readonly customerId: string | null;
  readonly discount: string;
  readonly saleStatus: 'COMPLETED' | 'IN_PROGRESS';
  readonly description: string | null;
  readonly saleItems: readonly SaleItemRequest[];
  readonly payments: readonly SalePaymentRequest[];
  readonly totalItems: number;
  readonly totalPrice: string;
  readonly totalPaidPrice: string;
}

export interface SaleReceipt {
  readonly id: string;
  readonly invoiceNumber: string;
  readonly status: 'COMPLETED' | 'IN_PROGRESS';
  readonly totalAmount: string;
  readonly totalPaid: string;
  readonly remaining: string;
}

export interface DraftSale {
  readonly id: string;
  readonly customerId: string | null;
  readonly discount: string;
  readonly items: readonly {
    readonly productId: string;
    readonly quantity: string;
  }[];
}
