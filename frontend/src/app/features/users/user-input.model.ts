/** New staff members always get the CASHIER role on the backend. */
export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}

/** Role, status and password are not editable through this feature. */
export interface UpdateUserInput {
  readonly name: string;
  readonly email: string;
}
