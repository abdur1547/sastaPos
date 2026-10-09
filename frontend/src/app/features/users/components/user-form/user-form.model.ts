export interface UserFormValue {
  readonly name: string;
  readonly email: string;
  /** Empty when editing an existing user. */
  readonly password: string;
}
