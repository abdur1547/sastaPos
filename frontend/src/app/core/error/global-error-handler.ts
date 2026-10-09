import { ErrorHandler, Injectable, NgZone, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ApiError } from '../http/api-error.model';

/** Application-wide fallback for errors that no component handled itself. */
@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  private readonly snackBar = inject(MatSnackBar);
  private readonly zone = inject(NgZone);

  handleError(error: unknown): void {
    console.error('[App] unhandled error', error);
    const message = error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
    this.zone.run(() => this.snackBar.open(message, 'Dismiss', { duration: 6000 }));
  }
}
