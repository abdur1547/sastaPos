import {
  ChangeDetectionStrategy,
  Component,
  ErrorHandler,
  OnDestroy,
  inject,
  signal,
} from "@angular/core";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";

import {
  ReceiptConfig,
  ReceiptData,
  ReceiptGateway,
  ReceiptLayout,
} from "../../core/hardware/receipt.gateway";

const SAMPLE_RECEIPT: ReceiptData = {
  invoiceNumber: "SAMPLE-001",
  issuedAt: "2026-10-14 15:00",
  currency: "PKR",
  customer: "Sample customer",
  items: [
    {
      name: "Everyday tea - family pack with a long sample product name",
      sku: "TEA-001",
      barcode: "036000291452",
      quantity: 2,
      unitPriceMinor: 12550,
    },
    {
      name: "Bread",
      sku: "BREAD-001",
      barcode: null,
      quantity: 1,
      unitPriceMinor: 15000,
    },
  ],
  discountMinor: 1000,
  taxMinor: 500,
  paidMinor: 30000,
  isCopy: false,
};

@Component({
  selector: "app-receipt-preview-page",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./receipt-preview.page.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReceiptPreviewPage implements OnDestroy {
  private readonly gateway = inject(ReceiptGateway);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly builder = inject(FormBuilder).nonNullable;
  private destroyed = false;

  protected readonly form = this.builder.group({
    paperProfile: this.builder.control<ReceiptConfig["paperProfile"]>("58mm"),
    header: [
      "Sample Store\nMain counter",
      [Validators.maxLength(1000), Validators.pattern(/^[\x20-\x7e\n]*$/)],
    ],
    footer: [
      "Thank you for shopping!\nPlease visit again.",
      [Validators.maxLength(1000), Validators.pattern(/^[\x20-\x7e\n]*$/)],
    ],
    showSku: [false],
    showBarcode: [false],
    showCustomer: [true],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal("");
  protected readonly layout = signal<ReceiptLayout | null>(null);

  protected async preview(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.layout.set(null);
    this.error.set("");
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set(
        "Header and footer must use ASCII text or line breaks, up to 1000 characters each.",
      );
      return;
    }
    this.busy.set(true);
    this.form.disable();
    try {
      const layout = await this.gateway.preview(SAMPLE_RECEIPT, {
        version: 1,
        ...this.form.getRawValue(),
      });
      if (!this.destroyed) {
        this.layout.set(layout);
      }
    } catch (error) {
      if (this.destroyed) {
        this.errorHandler.handleError(error);
      } else {
        this.error.set(error instanceof Error ? error.message : String(error));
      }
    } finally {
      if (!this.destroyed) {
        this.busy.set(false);
        this.form.enable();
      }
    }
  }

  protected settingsChanged(): void {
    this.layout.set(null);
    this.error.set("");
  }

  ngOnDestroy(): void {
    this.destroyed = true;
  }
}
