import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import { FormControl, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressBarModule } from "@angular/material/progress-bar";
import { startWith } from "rxjs";

import { fromScaled, toScaled } from "../../../sell/domain/decimal";
import { VOID_REASON_MAX_LENGTH } from "../../domain/sale-void.policy";
import { SaleDetail } from "../../models/sale-detail.model";

export interface VoidSaleDialogData {
  readonly sale: SaleDetail;
  /** Performs the void; a rejection keeps the dialog open and shows the message. */
  readonly confirm: (reason: string) => Promise<void>;
}

const QUICK_REASONS = [
  "Customer returned items",
  "Wrong items billed",
  "Pricing error",
  "Duplicate sale",
  "Payment failed",
] as const;

@Component({
  selector: "app-void-sale-dialog",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
  ],
  templateUrl: "./void-sale-dialog.component.html",
  styleUrl: "./void-sale-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VoidSaleDialogComponent {
  protected readonly data = inject<VoidSaleDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<VoidSaleDialogComponent, boolean>>(MatDialogRef);

  protected readonly maxLength = VOID_REASON_MAX_LENGTH;
  protected readonly quickReasons = QUICK_REASONS;
  protected readonly header = this.data.sale.header;

  protected readonly reason = new FormControl("", {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.pattern(/\S/),
      Validators.maxLength(VOID_REASON_MAX_LENGTH),
    ],
  });
  private readonly reasonValue = toSignal(
    this.reason.valueChanges.pipe(startWith(this.reason.value)),
    { initialValue: "" },
  );

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** The customer's balance moves by -(total - paid): their unpaid part of this bill is cancelled. */
  protected readonly balanceChange = computed(() => {
    const unpaid =
      toScaled(this.header.totalAmount, 2) - toScaled(this.header.totalPaid, 2);
    return unpaid === 0n ? null : fromScaled(unpaid, 2);
  });

  protected readonly hasPayments = Number(this.header.totalPaid) > 0;

  protected selectQuickReason(reason: string): void {
    this.reason.setValue(reason);
    this.reason.markAsTouched();
  }

  protected isQuickReason(reason: string): boolean {
    return this.reasonValue() === reason;
  }

  protected async submit(): Promise<void> {
    this.reason.markAsTouched();
    if (this.reason.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.dialogRef.disableClose = true;
    try {
      await this.data.confirm(this.reason.value.trim());
      this.dialogRef.close(true);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : "The sale could not be voided.",
      );
    } finally {
      this.saving.set(false);
      this.dialogRef.disableClose = false;
    }
  }
}
