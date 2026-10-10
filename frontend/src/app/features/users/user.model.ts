import { UserRole, UserStatus } from "../../core/auth/auth.model";

export type { UserRole, UserStatus };

/**
 * A staff member of the current store. Users are managed through the backend
 * API because passwords are hashed server-side. PowerSync also keeps a
 * credential-free, read-only identity projection for related sales/void records.
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
