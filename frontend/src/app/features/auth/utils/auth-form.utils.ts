import { AbstractControl, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';

import { ApiError } from '../../../core/http/api-error.model';

export const MIN_PASSWORD_LENGTH = 8;

/** Control validator: value must equal the value of another control. */
export function matchesControl(other: () => AbstractControl): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    control.value === other().value ? null : { mismatch: true };
}

/**
 * Pushes server-side field errors onto matching controls and returns the
 * message to show at form level (empty when every error was field-specific).
 */
export function applyApiError(form: FormGroup, error: unknown): string {
  if (!(error instanceof ApiError)) {
    return 'Something went wrong. Please try again.';
  }

  let mapped = 0;
  for (const fieldError of error.fieldErrors) {
    const control = fieldError.property ? form.get(fieldError.property) : null;
    if (control) {
      control.setErrors({ server: fieldError.message ?? 'Invalid value.' });
      control.markAsTouched();
      mapped++;
    }
  }
  return mapped > 0 && mapped === error.fieldErrors.length ? '' : error.message;
}
