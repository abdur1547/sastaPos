import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import { Customer } from "../../customer.model";
import { CustomerFormValue } from "./customer-form.model";

const MAX_TEXT = 255;

/** One form for both creating and editing a customer; pass `customer` to edit. */
@Component({
  selector: "app-customer-form",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    FormAlertComponent,
  ],
  templateUrl: "./customer-form.component.html",
  styleUrl: "./customer-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerFormComponent {
  readonly customer = input<Customer | null>(null);
  readonly saving = input(false);
  readonly errorMessage = input("");

  readonly save = output<CustomerFormValue>();
  readonly cancel = output<void>();

  protected readonly isEdit = computed(() => this.customer() !== null);
  protected readonly balanceLabel = computed(() => {
    const balance = Number(this.customer()?.accountBalance ?? 0);
    if (balance > 0) {
      return `Owes the store Rs ${this.customer()!.accountBalance}`;
    }
    return balance < 0
      ? `Store owes the customer Rs ${this.customer()!.accountBalance.replace("-", "")}`
      : "Settled";
  });

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(MAX_TEXT)]],
    phoneNumber: ["", Validators.maxLength(MAX_TEXT)],
    ntn: ["", Validators.maxLength(MAX_TEXT)],
    status: [true],
  });

  constructor() {
    effect(() => {
      const customer = this.customer();
      if (!customer) {
        return;
      }
      this.form.reset({
        name: customer.name,
        phoneNumber: customer.phoneNumber ?? "",
        ntn: customer.ntn ?? "",
        status: customer.status === "ACTIVE",
      });
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.save.emit({ ...value, status: value.status ? "ACTIVE" : "INACTIVE" });
  }

  protected fieldError(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) {
      return "";
    }
    if (errors["required"]) {
      return "This field is required.";
    }
    if (errors["maxlength"]) {
      return `Must be at most ${errors["maxlength"].requiredLength} characters.`;
    }
    return "This value is invalid.";
  }
}
