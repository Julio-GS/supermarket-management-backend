export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class ConflictError extends DomainError {
  constructor(message = "Resource already exists") {
    super(message, "CONFLICT");
  }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found") {
    super(message, "NOT_FOUND");
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message = "Invalid credentials") {
    super(message, "UNAUTHORIZED");
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Invalid input") {
    super(message, "VALIDATION_ERROR");
  }
}
