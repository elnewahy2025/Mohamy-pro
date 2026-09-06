export class IntakeAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeAccessDeniedError';
  }
}

export class IntakeNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeNotFoundError';
  }
}

export class IntakeInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeInvalidStateError';
  }
}
