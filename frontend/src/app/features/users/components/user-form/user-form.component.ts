import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from "@angular/core";
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";

import { FormAlertComponent } from "../../../../shared/components/form-alert/form-alert.component";
import { User } from "../../user.model";
import { UserFormValue } from "./user-form.model";

const MAX_TEXT = 255;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72;

/** One form for both creating and editing a staff member; pass `user` to edit. */
@Component({
  selector: "app-user-form",
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    FormAlertComponent,
  ],
  templateUrl: "./user-form.component.html",
  styleUrl: "./user-form.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormComponent {
  readonly user = input<User | null>(null);
  readonly saving = input(false);
  readonly errorMessage = input("");

  readonly save = output<UserFormValue>();
  readonly cancel = output<void>();
  readonly remove = output<void>();

  protected readonly isEdit = computed(() => this.user() !== null);

  private readonly formBuilder = inject(FormBuilder).nonNullable;
  protected readonly form = this.formBuilder.group({
    name: ["", [Validators.required, Validators.maxLength(MAX_TEXT)]],
    email: ["", [Validators.required, Validators.email, Validators.maxLength(MAX_TEXT)]],
    password: ["", this.passwordValidators()],
    confirmPassword: [""],
  });

  constructor() {
    this.form.controls.password.valueChanges.subscribe(() =>
      this.form.controls.confirmPassword.updateValueAndValidity(),
    );

    effect(() => {
      const user = this.user();
      const { password, confirmPassword } = this.form.controls;
      // Passwords are only collected on creation.
      password.setValidators(user ? [] : this.passwordValidators());
      confirmPassword.setValidators(user ? [] : [Validators.required, (c) => this.matchesPassword(c)]);
      if (user) {
        this.form.reset({ name: user.name, email: user.email, password: "", confirmPassword: "" });
      } else {
        password.updateValueAndValidity();
        confirmPassword.updateValueAndValidity();
      }
    });
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { name, email, password } = this.form.getRawValue();
    this.save.emit({ name, email, password });
  }

  protected fieldError(control: AbstractControl): string {
    const errors = control.errors;
    if (!errors) {
      return "";
    }
    if (errors["required"]) {
      return "This field is required.";
    }
    if (errors["email"]) {
      return "Enter a valid email address.";
    }
    if (errors["maxlength"]) {
      return `Must be at most ${errors["maxlength"].requiredLength} characters.`;
    }
    if (errors["minlength"]) {
      return `Must be at least ${errors["minlength"].requiredLength} characters.`;
    }
    if (errors["password"]) {
      return "Use at least one letter and one digit.";
    }
    if (errors["mismatch"]) {
      return "Passwords do not match.";
    }
    return "This value is invalid.";
  }

  private passwordValidators() {
    return [
      Validators.required,
      Validators.minLength(MIN_PASSWORD),
      Validators.maxLength(MAX_PASSWORD),
      (control: AbstractControl): ValidationErrors | null =>
        /[A-Za-z]/.test(control.value) && /\d/.test(control.value) ? null : { password: true },
    ];
  }

  private matchesPassword(control: AbstractControl): ValidationErrors | null {
    return control.value === this.form?.controls.password.value ? null : { mismatch: true };
  }
}
