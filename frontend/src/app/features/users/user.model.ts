import { UserRole, UserStatus } from "../../core/auth/auth.model";

export type { UserRole, UserStatus };

/**
 * A staff member of the current store. Users are managed through the backend
 * API (never stored locally) because passwords are hashed server-side.
 */
export interface User {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
  readonly lastLoginAt: string | null;
  readonly storeId: string | null;
}
