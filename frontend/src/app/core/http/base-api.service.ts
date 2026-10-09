import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { ApiError, ApiErrorKind, ApiErrorResponse } from './api-error.model';

const NETWORK_MESSAGE = 'Cannot reach the server. Check your internet connection and try again.';

/**
 * Base class for all API services: builds URLs against the configured API
 * origin and converts every failure into a typed {@link ApiError}.
 */
export abstract class BaseApiService {
  protected readonly http = inject(HttpClient);
  protected readonly baseUrl = environment.apiBaseUrl;

  protected get<T>(path: string): Observable<T> {
    return this.http.get<T>(this.url(path)).pipe(catchError(this.handleError));
  }

  protected post<TResponse, TBody = unknown>(path: string, body?: TBody): Observable<TResponse> {
    return this.http.post<TResponse>(this.url(path), body ?? null).pipe(catchError(this.handleError));
  }

  protected url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private readonly handleError = (error: unknown): Observable<never> =>
    throwError(() => toApiError(error));
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (!(error instanceof HttpErrorResponse)) {
    return new ApiError('unknown', 0, 'Something went wrong. Please try again.');
  }
  if (error.status === 0) {
    return new ApiError('network', 0, NETWORK_MESSAGE);
  }

  const body = isApiErrorResponse(error.error) ? error.error : null;
  const kind: ApiErrorKind =
    error.status === 401 || error.status === 403
      ? 'unauthorized'
      : error.status === 400 || error.status === 409 || error.status === 422
        ? 'validation'
        : error.status >= 500
          ? 'server'
          : 'unknown';
  const fallback = error.status >= 500 ? 'The server had a problem. Please try again shortly.' : 'The request failed.';

  return new ApiError(kind, error.status, body?.message || fallback, body?.code ?? null, body?.fieldErrors ?? []);
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return typeof value === 'object' && value !== null && ('message' in value || 'code' in value);
}
