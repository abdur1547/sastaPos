import {
  ChangeDetectionStrategy,
  Component,
  computed,
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
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatSnackBar } from "@angular/material/snack-bar";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { catchError, map, of, startWith, switchMap } from "rxjs";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import { VendorValidationError } from "../../vendor.errors";
import {
  PaymentDirection,
  PaymentMethod,
  previewVendorPayment,
} from "../../vendor-payment.model";
import {
  Vendor,
  vendorBalanceLabel,
} from "../../vendor.model";
import { VendorService } from "../../vendor.service";
import { vendorBalanceInWords } from "../../../../shared/utils/number-to-words";

type LoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly vendor: Vendor }
  | { readonly status: "missing" }
  | { readonly status: "error"; readonly message: string };

function validateAmount(control: AbstractControl): ValidationErrors | null {
  const value = String(control.value ?? "").trim();
  if (!value) return null;
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(value)) {
    return { invalidAmount: true };
  }
  const numeric = parseFloat(value);
  if (numeric <= 0) {
    return { invalidAmount: true };
  }
  return null;
}

@Component({
  selector: "app-vendor-payment-page",
  imports: [
    RouterLink,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: "./vendor-payment.page.html",
  styleUrl: "./vendor-payment.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorPaymentPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly vendors = inject(VendorService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal("");
  protected readonly confirmedZeroCross = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    direction: ["OUTGOING" as PaymentDirection, Validators.required],
    amount: ["", [Validators.required, validateAmount]],
    method: ["CASH" as PaymentMethod, Validators.required],
    referenceNumber: ["", Validators.maxLength(255)],
    description: ["", Validators.maxLength(1000)],
  });

  protected readonly state = toSignal(
    this.route.paramMap.pipe(
      map((params) => params.get("id")),
      switchMap((id) => {
        if (!id) {
          return of<LoadState>({ status: "missing" });
        }
        return this.vendors.watchById(id).pipe(
          map((vendor): LoadState =>
            vendor ? { status: "ready", vendor } : { status: "missing" },
          ),
          catchError((err: unknown) =>
            of<LoadState>({
              status: "error",
              message:
                err instanceof Error ? err.message : "Could not load vendor.",
            }),
          ),
          startWith<LoadState>({ status: "loading" }),
        );
      }),
    ),
    { initialValue: { status: "loading" } as LoadState },
  );

  protected readonly vendor = computed(() => {
    const s = this.state();
    return s.status === "ready" ? s.vendor : null;
  });

  private readonly amountVal = toSignal(this.form.controls.amount.valueChanges, {
    initialValue: "",
  });
  private readonly directionVal = toSignal(
    this.form.controls.direction.valueChanges,
    { initialValue: "OUTGOING" as PaymentDirection },
  );

  protected readonly preview = computed(() => {
    const v = this.vendor();
    const amount = this.amountVal();
    const direction = this.directionVal();

    if (!v || !amount || this.form.controls.amount.invalid) return null;

    try {
      const prev = previewVendorPayment(v.accountBalance, amount, direction);
      return {
        ...prev,
        inWords: vendorBalanceInWords(prev.balance),
      };
    } catch (err) {
      if (err instanceof VendorValidationError) {
        return { error: err.message };
      }
      return null;
    }
  });

  constructor() {
    this.form.controls.amount.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.confirmedZeroCross.set(false));

    this.form.controls.direction.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.confirmedZeroCross.set(false));
  }

  protected currentBalanceLabel(): string {
    const v = this.vendor();
    return v ? vendorBalanceLabel(v.accountBalance) : "";
  }

  protected currentBalanceInWords(): string {
    const v = this.vendor();
    return v ? vendorBalanceInWords(v.accountBalance) : "";
  }

  protected async submit(): Promise<void> {
    const v = this.vendor();
    if (!v || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const prev = this.preview();
    if (prev && "crossesZero" in prev && prev.crossesZero && !this.confirmedZeroCross()) {
      this.saveError.set("Please confirm that this payment crosses the account balance before recording.");
      return;
    }

    this.saving.set(true);
    this.saveError.set("");

    try {
      const val = this.form.getRawValue();
      await this.vendors.recordPayment(v.id, {
        direction: val.direction,
        amount: val.amount.trim(),
        method: val.method,
        referenceNumber: val.referenceNumber.trim() || null,
        description: val.description.trim() || null,
        allowZeroCross: this.confirmedZeroCross(),
      });

      this.saved.set(true);
      this.snackBar.open("Settlement payment recorded successfully.", "Dismiss", {
        duration: 3000,
      });
      await this.router.navigateByUrl(`/vendors/${v.id}/ledger`);
    } catch (err) {
      this.saveError.set(
        err instanceof Error ? err.message : "Failed to record payment.",
      );
    } finally {
      this.saving.set(false);
    }
  }
}

