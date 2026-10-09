import { FormControl, FormGroup } from '@angular/forms';

import { ApiError } from '../../../core/http/api-error.model';
import { applyApiError } from './auth-form.utils';

describe('applyApiError', () => {
  it('maps field errors onto controls and hides the form-level message', () => {
    const form = new FormGroup({ email: new FormControl('') });
    const error = new ApiError('validation', 400, 'Validation failed', 'VALIDATION_FAILED', [
      { property: 'email', message: 'already used' },
    ]);
    expect(applyApiError(form, error)).toBe('');
    expect(form.controls.email.errors).toEqual({ server: 'already used' });
  });

  it('returns the API message when nothing maps to a field', () => {
    const form = new FormGroup({ email: new FormControl('') });
    expect(applyApiError(form, new ApiError('unauthorized', 401, 'Invalid credentials'))).toBe('Invalid credentials');
  });
});
