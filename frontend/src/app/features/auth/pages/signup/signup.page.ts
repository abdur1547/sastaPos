import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { FormAlertComponent } from '../../../../shared/components/form-alert/form-alert.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { AuthShellComponent } from '../../components/auth-shell/auth-shell.component';
import { MIN_PASSWORD_LENGTH, applyApiError, matchesControl } from '../../utils/auth-form.utils';

function createSignupForm() {
  const password = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
  });

  return new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(255)] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(255)],
    }),
    password,
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, matchesControl((): FormControl<string> => password)],
    }),
  });
}

@Component({
  selector: 'app-signup-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    AuthShellComponent,
    FormFieldComponent,
    FormAlertComponent,
  ],
  templateUrl: './signup.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly formError = signal('');

  protected readonly form = createSignupForm();

  constructor() {
    this.form.controls.password.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      const { name, email, password } = this.form.getRawValue();
      await this.auth.signup({ name: name.trim(), email: email.trim(), password });
      await this.router.navigate(['/sell']);
    } catch (error) {
      this.formError.set(applyApiError(this.form, error));
    } finally {
      this.submitting.set(false);
    }
  }
}
