import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterLink } from '@angular/router';

import { AuthApiService } from '../../../../core/auth/auth-api.service';
import { FormAlertComponent } from '../../../../shared/components/form-alert/form-alert.component';
import { FormFieldComponent } from '../../../../shared/components/form-field/form-field.component';
import { AuthShellComponent } from '../../components/auth-shell/auth-shell.component';
import { MIN_PASSWORD_LENGTH, applyApiError, matchesControl } from '../../utils/auth-form.utils';
import { firstValueFrom } from 'rxjs';

type ResetStep = 'request' | 'complete';

function createCompleteForm() {
  const newPassword = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH)],
  });

  return new FormGroup({
    token: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    newPassword,
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, matchesControl((): FormControl<string> => newPassword)],
    }),
  });
}

@Component({
  selector: 'app-reset-password-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatProgressSpinnerModule,
    AuthShellComponent,
    FormFieldComponent,
    FormAlertComponent,
  ],
  templateUrl: './reset-password.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ResetPasswordPage {
  private readonly api = inject(AuthApiService);
  private readonly router = inject(Router);

  protected readonly step = signal<ResetStep>('request');
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');
  protected readonly infoMessage = signal('');

  protected readonly requestForm = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
  });

  protected readonly completeForm = createCompleteForm();

  constructor() {
    this.completeForm.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(() => this.completeForm.controls.confirmPassword.updateValueAndValidity());
  }

  protected showCompleteStep(): void {
    this.formError.set('');
    this.step.set('complete');
  }

  protected showRequestStep(): void {
    this.formError.set('');
    this.step.set('request');
  }

  protected async submitRequest(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.formError.set('');
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      const response = await firstValueFrom(
        this.api.requestPasswordReset({ email: this.requestForm.controls.email.value.trim() }),
      );
      this.infoMessage.set(response.message || 'If the account exists, a reset token has been sent.');
      this.step.set('complete');
    } catch (error) {
      this.formError.set(applyApiError(this.requestForm, error));
    } finally {
      this.submitting.set(false);
    }
  }

  protected async submitComplete(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    this.formError.set('');
    if (this.completeForm.invalid) {
      this.completeForm.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      const { token, newPassword } = this.completeForm.getRawValue();
      await firstValueFrom(this.api.completePasswordReset({ token: token.trim(), newPassword }));
      await this.router.navigate(['/auth/login']);
    } catch (error) {
      this.formError.set(applyApiError(this.completeForm, error));
    } finally {
      this.submitting.set(false);
    }
  }
}
