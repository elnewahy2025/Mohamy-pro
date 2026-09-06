export class IntegrationsAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationsAccessDeniedError';
  }
}

export class IntegrationsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationsNotFoundError';
  }
}

export class IntegrationsInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntegrationsInvalidStateError';
  }
}
