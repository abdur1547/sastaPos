import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export { applyApiError } from '../../../core/http/api-form-error';

export const MIN_PASSWORD_LENGTH = 8;

/** Control validator: value must equal the value of another control. */
export function matchesControl(other: () => AbstractControl): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null =>
    control.value === other().value ? null : { mismatch: true };
}
