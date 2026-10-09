export class UserValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserValidationError";
  }
}

export class UserNotFoundError extends Error {
  constructor(id: string) {
    super(`Staff member ${id} was not found in the current store.`);
    this.name = "UserNotFoundError";
  }
}

export class UserConflictError extends Error {
  constructor(message = "An account with this email already exists.") {
    super(message);
    this.name = "UserConflictError";
  }
}

export class UserPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserPersistenceError";
  }
}
