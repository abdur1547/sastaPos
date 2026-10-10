import { Injectable, inject } from "@angular/core";
import { Observable } from "rxjs";

import { AuthService } from "../../core/auth/auth.service";
import { SaleRepository, SaleContext } from "./data/sale.repository";
import { SellCatalogRepository } from "./data/sell-catalog.repository";
import { fromScaled, toScaled } from "./domain/decimal";
import { previewTotals } from "./domain/sale-calculator";
import { validateSaleRequest } from "./domain/sale-request.validator";
import {
  DraftSale,
  PaymentMethod,
  SaleReceipt,
  SaleRequest,
} from "./models/sale.model";
import { PendingBill, SellCustomer, SellProduct } from "./models/sell.model";
import { SaleValidationError } from "./sell.errors";

export interface CheckoutLine {
  readonly product: SellProduct;
  readonly quantity: number | string;
}

export interface CheckoutPayment {
  readonly amount: number | string;
  readonly method: PaymentMethod;
  readonly referenceNumber?: string | null;
  readonly description?: string | null;
}

/** What the screen hands over; the service turns it into a backend-shaped request. */
export interface CheckoutInput {
  readonly saleId: string | null;
  readonly customerId: string | null;
  readonly discount: number | string;
  readonly lines: readonly CheckoutLine[];
  readonly payment?: CheckoutPayment | null;
  readonly description?: string | null;
}

@Injectable({ providedIn: "root" })
export class SaleService {
  private readonly auth = inject(AuthService);
  private readonly catalog = inject(SellCatalogRepository);
  private readonly sales = inject(SaleRepository);

  watchProducts(): Observable<readonly SellProduct[]> {
    return this.catalog.watchProducts(this.requireContext().storeId);
  }

  watchCustomers(): Observable<readonly SellCustomer[]> {
    return this.catalog.watchCustomers(this.requireContext().storeId);
  }

  watchPendingBills(): Observable<readonly PendingBill[]> {
    return this.catalog.watchPendingBills(this.requireContext().storeId);
  }

  loadDraft(id: string): Promise<DraftSale | null> {
    return this.catalog.findDraft(id, this.requireContext().storeId);
  }

  findProducts(ids: readonly string[]): Promise<readonly SellProduct[]> {
    return this.catalog.findProducts(ids, this.requireContext().storeId);
  }

  /** Completes a sale: DEBIT when fully paid, CREDIT (customer required) otherwise. */
  complete(input: CheckoutInput): Promise<SaleReceipt> {
    return this.submit(input, "COMPLETED");
  }

  /** Saves the cart as a pending bill without touching stock, payments or ledger. */
  saveDraft(input: CheckoutInput): Promise<SaleReceipt> {
    return this.submit({ ...input, payment: null }, "IN_PROGRESS");
  }

  discardDraft(id: string): Promise<void> {
    return this.sales.discardDraft(id, this.requireContext());
  }

  private submit(
    input: CheckoutInput,
    saleStatus: SaleRequest["saleStatus"],
  ): Promise<SaleReceipt> {
    const context = this.requireContext();
    const request = this.buildRequest(input, saleStatus);
    validateSaleRequest(request);
    return this.sales.submit(request, context);
  }

  private buildRequest(
    input: CheckoutInput,
    saleStatus: SaleRequest["saleStatus"],
  ): SaleRequest {
    let totals;
    try {
      totals = previewTotals(input.lines, input.discount);
    } catch (error) {
      throw new SaleValidationError(
        error instanceof Error ? error.message : "Invalid sale amounts.",
      );
    }
    const payment = input.payment ?? null;
    const paid = payment ? toScaled(payment.amount, 2) : 0n;
    const total = toScaled(totals.total, 2);

    return {
      saleId: input.saleId,
      saleType: saleStatus === "COMPLETED" && paid < total ? "CREDIT" : "DEBIT",
      customerId: input.customerId,
      discount: totals.discount,
      saleStatus,
      description: input.description?.trim() || null,
      saleItems: totals.lines.map((line) => ({
        productId: line.product.id,
        quantity: line.quantity,
        itemTotal: line.taxable,
      })),
      payments:
        payment && paid > 0n
          ? [
              {
                amount: fromScaled(paid, 2),
                method: payment.method,
                referenceNumber: payment.referenceNumber?.trim() || null,
                description: payment.description?.trim() || null,
              },
            ]
          : [],
      totalItems: totals.lines.length,
      totalPrice: totals.total,
      totalPaidPrice: fromScaled(paid, 2),
    };
  }

  private requireContext(): SaleContext {
    const user = this.auth.user();
    if (!user?.storeId) {
      throw new SaleValidationError("Sign in to a store before selling.");
    }
    return { storeId: user.storeId, userId: user.id };
  }
}
