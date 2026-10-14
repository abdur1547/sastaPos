import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { OnboardingProgressService } from '../../../../core/onboarding/onboarding-progress.service';
import { FormAlertComponent } from '../../../../shared/components/form-alert/form-alert.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { AuthShellComponent } from '../../components/auth-shell/auth-shell.component';
import { applyApiError } from '../../utils/auth-form.utils';

@Component({
  selector: 'app-login-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    AuthShellComponent,
    FormFieldComponent,
    FormAlertComponent,
  ],
  templateUrl: './login.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly onboarding = inject(OnboardingProgressService);

  protected readonly notice = this.auth.notice;
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');

  protected readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

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
      const { email, password } = this.form.getRawValue();
      await this.auth.login({ email: email.trim(), password });
      await this.router.navigate([this.onboarding.required() ? '/onboarding' : '/sell']);
    } catch (error) {
      this.formError.set(applyApiError(this.form, error));
    } finally {
      this.submitting.set(false);
    }
  }
}
