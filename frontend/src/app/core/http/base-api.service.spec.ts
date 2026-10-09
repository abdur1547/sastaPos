import { HttpErrorResponse } from '@angular/common/http';

import { toApiError } from './base-api.service';

describe('toApiError', () => {
  it('maps status 0 to a network error', () => {
    const error = toApiError(new HttpErrorResponse({ status: 0 }));
    expect(error.isNetworkError).toBe(true);
  });

  it('keeps backend message, code and field errors', () => {
    const error = toApiError(
      new HttpErrorResponse({
        status: 400,
        error: { status: 400, code: 'VALIDATION_FAILED', message: 'bad', fieldErrors: [{ property: 'email', message: 'x' }] },
      }),
    );
    expect(error.kind).toBe('validation');
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.message).toBe('bad');
    expect(error.fieldErrors).toHaveLength(1);
  });

  it('classifies 401 as unauthorized and 5xx as server', () => {
    expect(toApiError(new HttpErrorResponse({ status: 401 })).kind).toBe('unauthorized');
    expect(toApiError(new HttpErrorResponse({ status: 503 })).kind).toBe('server');
  });
});
