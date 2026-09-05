export class CommunicationsAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunicationsAccessDeniedError';
  }
}

export class CommunicationsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunicationsNotFoundError';
  }
}

export class CommunicationsInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommunicationsInvalidStateError';
  }
}
