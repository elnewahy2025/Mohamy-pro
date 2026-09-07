export class OpsAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpsAccessDeniedError';
  }
}

export class OpsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpsNotFoundError';
  }
}

export class OpsInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpsInvalidStateError';
  }
}
