export class ProductValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductValidationError";
  }
}

export class ProductNotFoundError extends Error {
  constructor(id: string) {
    super(`Product ${id} was not found in the current store.`);
    this.name = "ProductNotFoundError";
  }
}

export class ProductConflictError extends Error {
  constructor(field: "sku" | "barcode" | "pctCode") {
    super(`A product with this ${field} already exists in the current store.`);
    this.name = "ProductConflictError";
  }
}

export class ProductPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductPersistenceError";
  }
}
