import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import { CustomerValidationError } from "../../customer.errors";
import {
  balanceAfterPayment,
  customerBalanceLabel,
  paymentAmount,
} from "../../customer-payment.model";
import { CustomerService } from "../../customer.service";
import { watchCustomerPage } from "../customer-page-state";

@Component({
  selector: "app-customer-payment-page",
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: "./customer-payment.page.html",
  styleUrl: "../customer-account.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerPaymentPage {
  private readonly customers = inject(CustomerService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly state = toSignal(
    watchCustomerPage(inject(ActivatedRoute), this.customers),
  );
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal("");
  protected readonly confirmedCredit = signal(false);
  protected readonly balanceLabel = customerBalanceLabel;
  protected readonly form = inject(FormBuilder).nonNullable.group({
    amount: ["", [Validators.required, validateAmount]],
    method: ["CASH" as "CASH" | "BANK", Validators.required],
    referenceNumber: ["", Validators.maxLength(255)],
    description: ["", Validators.maxLength(1000)],
  });
  private readonly amount = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: "",
  });
  protected readonly preview = computed(() => {
    const state = this.state();
    if (state?.status !== "ready" || !this.amount()) return null;
    try {
      const balance = balanceAfterPayment(
        state.customer.accountBalance,
        this.amount(),
      );
      return {
        balance,
        label: customerBalanceLabel(balance),
        credit: balance.startsWith("-"),
      };
    } catch (error) {
      if (!(error instanceof CustomerValidationError)) throw error;
      return { error: error.message };
    }
  });

  constructor() {
    this.form.controls.amount.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.confirmedCredit.set(false));
    effect(() => {
      this.state();
      this.confirmedCredit.set(false);
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving() || this.saved()) return;
    this.saveError.set("");
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const state = this.state();
    if (state?.status !== "ready") return;
    const preview = this.preview();
    if (preview?.error) {
      this.saveError.set(preview.error);
      return;
    }
    if (preview?.credit && !this.confirmedCredit()) {
      this.saveError.set(
        "Confirm the customer's resulting credit before recording this payment.",
      );
      return;
    }
    this.saving.set(true);
    this.form.disable({ emitEvent: false });
    try {
      await this.customers.takePayment(state.customer.id, {
        ...this.form.getRawValue(),
        allowCredit: this.confirmedCredit(),
      });
      this.saved.set(true);
      this.snackBar.open(
        "Payment saved on this device. It will sync when online.",
        "Dismiss",
        { duration: 4000 },
      );
    } catch (error) {
      this.saveError.set(
        error instanceof Error ? error.message : "Could not save the payment.",
      );
    } finally {
      this.saving.set(false);
      if (!this.saved()) this.form.enable({ emitEvent: false });
    }
    if (this.saved()) {
      try {
        await this.router.navigate(["/customers", state.customer.id, "ledger"]);
      } catch (error) {
        this.saveError.set(
          error instanceof Error
            ? `Payment saved, but navigation failed: ${error.message}`
            : "Payment saved, but the ledger could not be opened. Use the return link.",
        );
      }
    }
  }
}

function validateAmount(
  control: AbstractControl<string>,
): ValidationErrors | null {
  if (!control.value) return null;
  try {
    paymentAmount(control.value);
    return null;
  } catch (error) {
    if (!(error instanceof CustomerValidationError)) throw error;
    return { paymentAmount: true };
  }
}
