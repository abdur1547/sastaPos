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
import { MatAutocompleteModule } from "@angular/material/autocomplete";
import { MatButtonModule } from "@angular/material/button";
import {
  MAT_DIALOG_DATA,
  MatDialogModule,
  MatDialogRef,
} from "@angular/material/dialog";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
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
  /** Offered when the sale is (partly) on credit and needs a customer account. */
  readonly customers: readonly SellCustomer[];
}

export interface PaymentDialogResult {
  readonly payment: CheckoutPayment;
  readonly customer: SellCustomer | null;
}

@Component({
  selector: "app-payment-dialog",
  imports: [
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
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
    inject<MatDialogRef<PaymentDialogComponent, PaymentDialogResult>>(
      MatDialogRef,
    );

  protected readonly methods: readonly PaymentMethod[] = ["CASH", "BANK"];

  protected readonly form = new FormGroup(
    {
      method: new FormControl<PaymentMethod>("CASH", { nonNullable: true }),
      amount: new FormControl<number | null>(Number(this.data.total), [
        Validators.required,
        Validators.min(0),
      ]),
      /** A string while the cashier is typing, the picked customer once chosen. */
      customer: new FormControl<SellCustomer | string | null>(
        this.data.customer,
      ),
      referenceNumber: new FormControl("", {
        nonNullable: true,
        validators: [Validators.maxLength(255)],
      }),
      description: new FormControl("", {
        nonNullable: true,
        validators: [Validators.maxLength(500)],
      }),
    },
    {
      validators: (group) =>
        this.validateAmount(
          group.value.amount ?? null,
          asCustomer(group.value.customer),
        ),
    },
  );

  private readonly amount = toSignal(
    this.form.controls.amount.valueChanges.pipe(
      startWith(this.form.controls.amount.value),
    ),
    {
      initialValue: this.form.controls.amount.value,
    },
  );

  private readonly customerValue = toSignal(
    this.form.controls.customer.valueChanges.pipe(
      startWith(this.form.controls.customer.value),
    ),
    { initialValue: this.form.controls.customer.value },
  );

  protected readonly selectedCustomer = computed(() =>
    asCustomer(this.customerValue()),
  );

  protected readonly filteredCustomers = computed(() => {
    const value = this.customerValue();
    const term = (typeof value === "string" ? value : (value?.name ?? ""))
      .trim()
      .toLowerCase();
    if (!term || typeof value !== "string") {
      return this.data.customers;
    }
    return this.data.customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(term) ||
        (customer.phoneNumber ?? "").includes(term),
    );
  });

  protected readonly remaining = computed(() => {
    const paid = toScaled(this.amount() ?? 0, 2);
    const remaining = toScaled(this.data.total, 2) - paid;
    return remaining > 0n ? fromScaled(remaining, 2) : "0.00";
  });

  protected readonly isCredit = computed(() => this.remaining() !== "0.00");

  protected displayCustomer(customer: SellCustomer | string | null): string {
    return typeof customer === "string" ? customer : (customer?.name ?? "");
  }

  protected selectSingleMatch(): void {
    const matches = this.filteredCustomers();
    if (
      matches.length === 1 &&
      typeof this.form.controls.customer.value === "string"
    ) {
      this.form.controls.customer.setValue(matches[0]);
    }
  }

  protected confirm(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.dialogRef.close({
      payment: {
        amount: value.amount ?? 0,
        method: value.method,
        referenceNumber: value.referenceNumber,
        description: value.description,
      },
      customer: asCustomer(value.customer),
    });
  }

  private validateAmount(
    amount: number | null,
    customer: SellCustomer | null,
  ): ValidationErrors | null {
    if (amount === null) {
      return null;
    }
    const paid = toScaled(amount, 2);
    const total = toScaled(this.data.total, 2);
    if (paid > total) {
      return { overpaid: true };
    }
    if (paid < total && !customer) {
      return { customerRequired: true };
    }
    return null;
  }
}

function asCustomer(
  value: SellCustomer | string | null | undefined,
): SellCustomer | null {
  return value && typeof value === "object" ? value : null;
}
