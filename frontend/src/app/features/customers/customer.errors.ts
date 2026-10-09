export class CustomerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerValidationError";
  }
}

export class CustomerNotFoundError extends Error {
  constructor(id: string) {
    super(`Customer ${id} was not found in the current store.`);
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerConflictError extends Error {
  constructor(field: "name" | "phoneNumber") {
    super(
      field === "name"
        ? "A customer with this name already exists in the current store."
        : "A customer with this phone number already exists.",
    );
    this.name = "CustomerConflictError";
  }
}

export class CustomerPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CustomerPersistenceError";
  }
}
