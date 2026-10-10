/** Product as the counter needs it: current price, stock, unit rules and summed tax rate. */
export interface SellProduct {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly barcode: string | null;
  /** Decimal string, e.g. "420.00". */
  readonly unitPrice: string;
  readonly stockQuantity: string;
  readonly allowsFraction: boolean;
  readonly unitName: string;
  /** Sum of the linked tax categories' rates, applied exclusively on top of the price. */
  readonly taxRate: number;
}

export interface SellCustomer {
  readonly id: string;
  readonly name: string;
  readonly phoneNumber: string | null;
  readonly accountBalance: string;
}

/** An IN_PROGRESS (draft) sale shown in the pending bills bar. */
export interface PendingBill {
  readonly id: string;
  readonly label: string;
}
