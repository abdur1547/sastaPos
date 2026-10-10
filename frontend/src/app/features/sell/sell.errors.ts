export class SaleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleValidationError";
  }
}

export class SaleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleNotFoundError";
  }
}

export class SaleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaleConflictError";
  }
}
