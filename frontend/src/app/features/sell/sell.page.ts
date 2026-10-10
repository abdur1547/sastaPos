import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { MatDialog } from "@angular/material/dialog";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { RETURN_TO_PARAM } from "../../core/navigation/return-navigation";
import { CustomerToolbarComponent } from "./components/customer-toolbar/customer-toolbar.component";
import {
  PaymentDialogComponent,
  PaymentDialogData,
} from "./components/payment-dialog/payment-dialog.component";
import { PendingBillsBarComponent } from "./components/pending-bills-bar/pending-bills-bar.component";
import { ProductToolbarComponent } from "./components/product-toolbar/product-toolbar.component";
import { SaleActionsComponent } from "./components/sale-actions/sale-actions.component";
import { SaleItemsTableComponent } from "./components/sale-items-table/sale-items-table.component";
import { SaleSummaryComponent } from "./components/sale-summary/sale-summary.component";
import { SellCustomer } from "./models/sell.model";
import { SaleService } from "./sale.service";
import { SellFormStore } from "./state/sell-form.store";

const SELL_URL = "/sell";

@Component({
  selector: "app-sell-page",
  imports: [
    CustomerToolbarComponent,
    PendingBillsBarComponent,
    ProductToolbarComponent,
    SaleActionsComponent,
    SaleItemsTableComponent,
    SaleSummaryComponent,
  ],
  templateUrl: "./sell.page.html",
  styleUrl: "./sell.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellPage {
  private readonly sales = inject(SaleService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly store = inject(SellFormStore);

  protected readonly products = toSignal(this.sales.watchProducts(), {
    initialValue: [],
  });
  protected readonly customers = toSignal(this.sales.watchCustomers(), {
    initialValue: [],
  });
  protected readonly pendingBills = toSignal(this.sales.watchPendingBills(), {
    initialValue: [],
  });

  protected readonly busy = signal(false);
  protected readonly canSubmit = computed(
    () => !this.store.isEmpty() && this.store.valid() && !this.busy(),
  );

  // Ids handed back by the product/customer editors, resolved once the local DB emits them.
  private readonly incomingCustomerId = signal<string | null>(null);
  private readonly incomingProductId = signal<string | null>(null);

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe((params) => {
        const customerId = params.get("newCustomerId");
        const productId = params.get("newProductId");
        if (!customerId && !productId) {
          return;
        }
        this.incomingCustomerId.set(customerId);
        this.incomingProductId.set(productId);
        void this.router.navigate([], {
          queryParams: { newCustomerId: null, newProductId: null },
          queryParamsHandling: "merge",
          replaceUrl: true,
        });
      });

    effect(() => {
      const id = this.incomingCustomerId();
      const customer = id
        ? this.customers().find((candidate) => candidate.id === id)
        : null;
      if (customer) {
        untracked(() => {
          this.store.setCustomer(customer);
          this.incomingCustomerId.set(null);
        });
      }
    });

    effect(() => {
      const id = this.incomingProductId();
      const product = id
        ? this.products().find((candidate) => candidate.id === id)
        : null;
      if (product) {
        untracked(() => {
          this.store.addProduct(product);
          this.incomingProductId.set(null);
        });
      }
    });
  }

  protected onCustomerSelected(customer: SellCustomer): void {
    this.store.setCustomer(customer);
  }

  protected onAddCustomer(): void {
    void this.router.navigate(["/customers/new"], {
      queryParams: { [RETURN_TO_PARAM]: SELL_URL },
    });
  }

  protected onAddProduct(): void {
    void this.router.navigate(["/products/new"], {
      queryParams: { [RETURN_TO_PARAM]: SELL_URL },
    });
  }

  protected onCreateReturn(): void {
    // Returns are out of scope on the backend for now; the button stays as a placeholder.
  }

  protected async onResumeBill(billId: string): Promise<void> {
    if (this.busy() || billId === this.store.activeDraftId()) {
      return;
    }
    await this.run(async () => {
      if (!this.store.isEmpty()) {
        await this.sales.saveDraft(this.store.checkoutInput());
      }
      const draft = await this.sales.loadDraft(billId);
      if (!draft) {
        this.notify("That pending bill no longer exists.");
        return;
      }
      const productsById = new Map(
        this.products().map((product) => [product.id, product]),
      );
      const items = draft.items.flatMap((item) => {
        const product = productsById.get(item.productId);
        return product ? [{ product, quantity: Number(item.quantity) }] : [];
      });
      this.store.restore({
        draftId: draft.id,
        customer:
          this.customers().find(
            (customer) => customer.id === draft.customerId,
          ) ?? null,
        discount: Number(draft.discount),
        items,
      });
      if (items.length < draft.items.length) {
        this.notify(
          "Some products are no longer available and were removed from this bill.",
        );
      }
    });
  }

  protected async onRemoveBill(billId: string): Promise<void> {
    await this.run(async () => {
      await this.sales.discardDraft(billId);
      if (billId === this.store.activeDraftId()) {
        this.store.reset();
      }
    });
  }

  protected async onAddToPending(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    await this.run(async () => {
      await this.sales.saveDraft(this.store.checkoutInput());
      this.store.reset();
      this.notify("Sale saved to pending bills.");
    });
  }

  protected onCancelSale(): void {
    this.store.reset();
  }

  protected async onPay(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }
    const data: PaymentDialogData = {
      total: this.store.totals().total,
      customer: this.store.customer(),
    };
    const payment = await firstValueFrom(
      this.dialog
        .open(PaymentDialogComponent, { data, autoFocus: "first-tabbable" })
        .afterClosed(),
    );
    if (!payment) {
      return;
    }
    await this.run(async () => {
      const receipt = await this.sales.complete(
        this.store.checkoutInput(payment),
      );
      this.store.reset();
      this.notify(`Sale ${receipt.invoiceNumber} completed.`);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch (error) {
      this.notify(
        error instanceof Error ? error.message : "Something went wrong.",
      );
    } finally {
      this.busy.set(false);
    }
  }

  private notify(message: string): void {
    this.snackBar.open(message, "Dismiss", { duration: 5000 });
  }
}
