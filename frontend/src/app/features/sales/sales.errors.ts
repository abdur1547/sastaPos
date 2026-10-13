export class SaleRegisterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleRegisterValidationError";
  }
}

export class SaleRegisterNotFoundError extends Error {
  constructor() {
    super("This sale no longer exists in the current store.");
    this.name = "SaleRegisterNotFoundError";
  }
}

/** The sale cannot be voided in its current state, or by the current user. */
export class SaleVoidRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleVoidRefusedError";
  }
}

export class SaleRegisterPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleRegisterPersistenceError";
  }
}
