import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatButtonModule } from "@angular/material/button";
import { MatIconModule } from "@angular/material/icon";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatButtonToggleModule } from "@angular/material/button-toggle";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { RouterLink } from "@angular/router";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import {
  TaxRegistrationStatus,
  Vendor,
  VendorStatus,
  vendorBalanceLabel,
} from "../../vendor.model";
import { vendorBalanceInWords } from "../../../../shared/utils/number-to-words";

export interface VendorFormValue {
  readonly name: string;
  readonly phoneNumber: string;
  readonly ntn: string;
  readonly strn: string;
  readonly salesTaxRegistrationStatus: TaxRegistrationStatus;
  readonly address: string;
  readonly status: VendorStatus;
}

@Component({
  selector: "app-vendor-form",
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: "./vendor-form.component.html",
  styleUrl: "./vendor-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VendorFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);

  readonly vendor = input<Vendor | null>(null);
  readonly saving = input(false);
  readonly errorMessage = input("");

  readonly saved = output<VendorFormValue>();
  readonly cancelled = output<void>();

  protected readonly isEdit = computed(() => !!this.vendor());
  protected readonly isRegistered = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    name: ["", [Validators.required, Validators.maxLength(255)]],
    phoneNumber: ["", [Validators.maxLength(255)]],
    salesTaxRegistrationStatus: ["UNREGISTERED" as TaxRegistrationStatus],
    strn: ["", [Validators.maxLength(255)]],
    ntn: ["", [Validators.maxLength(255)]],
    address: ["", [Validators.maxLength(500)]],
    status: [true], // true = ACTIVE, false = INACTIVE
  });

  ngOnInit(): void {
    const v = this.vendor();
    if (v) {
      const registered = v.salesTaxRegistrationStatus === "REGISTERED";
      this.isRegistered.set(registered);
      this.form.patchValue({
        name: v.name,
        phoneNumber: v.phoneNumber ?? "",
        salesTaxRegistrationStatus: v.salesTaxRegistrationStatus,
        strn: v.strn ?? "",
        ntn: v.ntn ?? "",
        address: v.address ?? "",
        status: v.status === "ACTIVE",
      });
      this.updateStrnValidation(registered);
    }

    this.form.controls.salesTaxRegistrationStatus.valueChanges.subscribe(
      (status) => {
        const registered = status === "REGISTERED";
        this.isRegistered.set(registered);
        this.updateStrnValidation(registered);
      },
    );
  }

  private updateStrnValidation(registered: boolean): void {
    const strnControl = this.form.controls.strn;
    if (registered) {
      strnControl.setValidators([Validators.required, Validators.maxLength(255)]);
    } else {
      strnControl.setValidators([Validators.maxLength(255)]);
    }
    strnControl.updateValueAndValidity();
  }

  protected balanceLabel(): string {
    const v = this.vendor();
    return v ? vendorBalanceLabel(v.accountBalance) : "";
  }

  protected balanceInWords(): string {
    const v = this.vendor();
    return v ? vendorBalanceInWords(v.accountBalance) : "";
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const val = this.form.getRawValue();
    this.saved.emit({
      name: val.name.trim(),
      phoneNumber: val.phoneNumber.trim(),
      ntn: val.ntn.trim(),
      strn: val.strn.trim(),
      salesTaxRegistrationStatus: val.salesTaxRegistrationStatus,
      address: val.address.trim(),
      status: val.status ? "ACTIVE" : "INACTIVE",
    });
  }

  protected fieldError(control: AbstractControl): string {
    if (!control.touched || !control.errors) return "";
    if (control.errors["required"]) return "This field is required.";
    if (control.errors["maxlength"]) {
      return `Must be at most ${control.errors["maxlength"].requiredLength} characters.`;
    }
    return "Invalid input.";
  }
}

