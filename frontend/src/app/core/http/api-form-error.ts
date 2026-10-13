import { FormGroup } from "@angular/forms";

import { ApiError } from "./api-error.model";

/** Maps backend field errors to controls, preserving unmatched errors at form level. */
export function applyApiError(form: FormGroup, error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Something went wrong. Please try again.";
  }

  let mapped = 0;
  for (const fieldError of error.fieldErrors) {
    const control = fieldError.property ? form.get(fieldError.property) : null;
    if (control) {
      control.setErrors({ server: fieldError.message ?? "Invalid value." });
      control.markAsTouched();
      mapped++;
    }
  }
  return mapped > 0 && mapped === error.fieldErrors.length ? "" : error.message;
}
