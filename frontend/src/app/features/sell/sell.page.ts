import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ErrorHandler,
  OnDestroy,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatDialog } from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSnackBar } from "@angular/material/snack-bar";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";

import { environment } from "../../../environments/environment";
import {
  ScanConsumer,
  ScanConsumerService,
} from "../../core/hardware/scan-consumer.service";
import {
  ScannerGateway,
  ScannerSimulation,
} from "../../core/hardware/scanner.gateway";
import { RETURN_TO_PARAM } from "../../core/navigation/return-navigation";
import { FormAlertComponent } from "../../shared/components/form-alert/form-alert.component";
import { CustomerToolbarComponent } from "./components/customer-toolbar/customer-toolbar.component";
import {
  PaymentDialogComponent,
  PaymentDialogData,
  PaymentDialogResult,
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
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormAlertComponent,
  ],
  templateUrl: "./sell.page.html",
  styleUrl: "./sell.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellPage implements OnInit, OnDestroy {
  private readonly sales = inject(SaleService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly scanner = inject(ScannerGateway);
  private readonly consumers = inject(ScanConsumerService);
  private readonly errorHandler = inject(ErrorHandler);
  private simulation: ScannerSimulation | null = null;
  private consumer: ScanConsumer | null = null;
  private destroyed = false;

  protected readonly development = !environment.production;
  protected readonly simulatedBarcode = new FormControl("036000291452", {
    nonNullable: true,
  });
  protected readonly scannerReady = signal(false);
  protected readonly scannerBusy = signal(false);
  protected readonly scannerError = signal("");
  private readonly paying = signal(false);

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
    () =>
      !this.store.isEmpty() &&
      this.store.valid() &&
      !this.busy() &&
      !this.paying(),
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

  async ngOnInit(): Promise<void> {
    if (!this.development) {
      return;
    }
    this.consumer = this.consumers.activate(
      (barcode) => this.addScannedProduct(barcode),
      (message) => this.scannerError.set(message),
      () => this.scanningAllowed(),
    );
    try {
      const simulation = await this.scanner.openSimulator((event) => {
        this.consumer?.receive(event);
      });
      if (this.destroyed) {
        await simulation.close();
        return;
      }
      this.simulation = simulation;
      this.scannerReady.set(true);
    } catch (error) {
      this.reportScannerError(error);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.consumer?.release();
    this.consumer = null;
    if (this.simulation) {
      void this.simulation
        .close()
        .catch((error: unknown) => this.errorHandler.handleError(error));
      this.simulation = null;
    }
  }

  protected scanningAllowed(): boolean {
    return (
      !this.destroyed &&
      !this.busy() &&
      !this.paying() &&
      this.dialog.openDialogs.length === 0
    );
  }

  protected async simulateScan(): Promise<void> {
    if (
      !this.simulation ||
      !this.scannerReady() ||
      this.scannerBusy() ||
      !this.scanningAllowed()
    ) {
      return;
    }
    this.scannerBusy.set(true);
    this.scannerError.set("");
    try {
      await this.simulation.sendChunk(`${this.simulatedBarcode.value}\r`);
    } catch (error) {
      this.reportScannerError(error);
    } finally {
      this.scannerBusy.set(false);
    }
  }

  private addScannedProduct(barcode: string): void {
    const matches = this.products().filter(
      (product) => product.barcode === barcode,
    );
    if (matches.length === 0) {
      this.scannerError.set("Product not found");
      return;
    }
    if (matches.length > 1) {
      this.scannerError.set(
        "Multiple products have this barcode. Resolve the duplicate before scanning.",
      );
      return;
    }
    this.store.addProduct(matches[0]);
    this.scannerError.set("");
  }

  private reportScannerError(error: unknown): void {
    if (this.destroyed) {
      this.errorHandler.handleError(error);
      return;
    }
    this.scannerError.set(
      error instanceof Error ? error.message : String(error),
    );
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
    this.paying.set(true);
    try {
      const data: PaymentDialogData = {
        total: this.store.totals().total,
        customer: this.store.customer(),
        customers: this.customers(),
      };
      const result = await firstValueFrom(
        this.dialog
          .open<PaymentDialogComponent, PaymentDialogData, PaymentDialogResult>(
            PaymentDialogComponent,
            { data, autoFocus: "first-tabbable" },
          )
          .afterClosed(),
      );
      if (!result) {
        return;
      }
      if (result.customer && result.customer.id !== this.store.customer()?.id) {
        this.store.setCustomer(result.customer);
      }
      await this.run(async () => {
        const receipt = await this.sales.complete(
          this.store.checkoutInput(result.payment),
        );
        this.store.reset();
        this.notify(`Sale ${receipt.invoiceNumber} completed.`);
      });
    } finally {
      this.paying.set(false);
    }
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
