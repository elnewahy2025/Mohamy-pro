export class BillingAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingAccessDeniedError';
  }
}

export class BillingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingNotFoundError';
  }
}

export class BillingInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BillingInvalidStateError';
  }
}
