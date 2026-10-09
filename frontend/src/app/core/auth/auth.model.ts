/** Request/response contracts mirror the Spring Boot `Auth` OpenAPI schemas. */
export type UserRole = 'OWNER' | 'CASHIER' | 'GLOBAL_ADMIN';
export type UserStatus = 'ACTIVE' | 'INACTIVE';

export interface AuthenticatedUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  /** Null until the owner creates a store (e.g. right after signup). */
  readonly storeId: string | null;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
}

export interface SignupRequest {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

export interface AuthResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
  readonly user: AuthenticatedUser;
}

export interface PasswordResetRequest {
  readonly email: string;
}

export interface PasswordResetCompleteRequest {
  readonly token: string;
  readonly newPassword: string;
}

export interface MessageResponse {
  readonly message: string;
}

/** Non-secret session metadata returned by the Rust credential store. */
export interface AuthSession {
  readonly user: AuthenticatedUser;
  /** Epoch milliseconds at which the JWT expires. */
  readonly expiresAt: number;
}

export type RestoredSession =
  | { readonly state: 'none' }
  | { readonly state: 'expired' }
  | { readonly state: 'valid'; readonly session: AuthSession };

export interface SaveSessionInput {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly user: AuthenticatedUser;
}
