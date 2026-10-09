/** Mirrors the backend `ApiFieldError` schema. */
export interface ApiFieldError {
  readonly code?: string;
  readonly message?: string;
  readonly property?: string;
  readonly rejectedValue?: unknown;
  readonly path?: string;
}

/** Mirrors the backend `ApiErrorResponse` schema. */
export interface ApiErrorResponse {
  readonly status?: number;
  readonly code?: string;
  readonly message?: string;
  readonly fieldErrors?: readonly ApiFieldError[];
}

export type ApiErrorKind = 'network' | 'unauthorized' | 'validation' | 'server' | 'unknown';

/** Normalised error thrown by every API service. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    readonly status: number,
    override readonly message: string,
    readonly code: string | null = null,
    readonly fieldErrors: readonly ApiFieldError[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isNetworkError(): boolean {
    return this.kind === 'network';
  }
}
