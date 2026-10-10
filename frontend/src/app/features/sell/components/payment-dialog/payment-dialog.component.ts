import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from "@angular/core";
import { toSignal } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { startWith } from "rxjs";

import { fromScaled, toScaled } from "../../domain/decimal";
import { PaymentMethod } from "../../models/sale.model";
import { SellCustomer } from "../../models/sell.model";
import { CheckoutPayment } from "../../sale.service";

export interface PaymentDialogData {
  readonly total: string;
  readonly customer: SellCustomer | null;
}

@Component({
  selector: "app-payment-dialog",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: "./payment-dialog.component.html",
  styleUrl: "./payment-dialog.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentDialogComponent {
  protected readonly data = inject<PaymentDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<PaymentDialogComponent, CheckoutPayment>>(MatDialogRef);

  protected readonly methods: readonly PaymentMethod[] = ["CASH", "BANK"];

  protected readonly form = new FormGroup(
    {
      method: new FormControl<PaymentMethod>("CASH", { nonNullable: true }),
      amount: new FormControl<number | null>(Number(this.data.total), [
        Validators.required,
        Validators.min(0),
      ]),
      referenceNumber: new FormControl("", {
        nonNullable: true,
        validators: [Validators.maxLength(255)],
      }),
      description: new FormControl("", {
        nonNullable: true,
        validators: [Validators.maxLength(500)],
      }),
    },
    { validators: (group) => this.validateAmount(group.value.amount ?? null) },
  );

  private readonly amount = toSignal(
    this.form.controls.amount.valueChanges.pipe(
      startWith(this.form.controls.amount.value),
    ),
    {
      initialValue: this.form.controls.amount.value,
    },
  );

  protected readonly remaining = computed(() => {
    const paid = toScaled(this.amount() ?? 0, 2);
    const remaining = toScaled(this.data.total, 2) - paid;
    return remaining > 0n ? fromScaled(remaining, 2) : "0.00";
  });

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      amount: value.amount ?? 0,
      method: value.method,
      referenceNumber: value.referenceNumber,
      description: value.description,
    });
  }

  private validateAmount(amount: number | null): ValidationErrors | null {
    if (amount === null) {
      return null;
    }
    const paid = toScaled(amount, 2);
    const total = toScaled(this.data.total, 2);
    if (paid > total) {
      return { overpaid: true };
    }
    if (paid < total && !this.data.customer) {
      return { customerRequired: true };
    }
    return null;
  }
}
