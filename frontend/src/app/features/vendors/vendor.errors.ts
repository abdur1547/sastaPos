export class VendorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorValidationError";
  }
}

export class VendorNotFoundError extends Error {
  constructor(id: string) {
    super(`Vendor ${id} was not found in the current store.`);
    this.name = "VendorNotFoundError";
  }
}

export class VendorConflictError extends Error {
  constructor(field: "name" | "phoneNumber" | "balance") {
    let message: string;
    switch (field) {
      case "name":
        message = "A vendor with this name already exists in the current store.";
        break;
      case "phoneNumber":
        message = "A vendor with this phone number already exists.";
        break;
      case "balance":
        message = "Cannot delete vendor with an outstanding non-zero balance. Settle the balance first.";
        break;
    }
    super(message);
    this.name = "VendorConflictError";
  }
}

export class VendorPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorPersistenceError";
  }
}

