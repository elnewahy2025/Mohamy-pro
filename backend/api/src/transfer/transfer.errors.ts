export class TransferAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferAccessDeniedError';
  }
}

export class TransferNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferNotFoundError';
  }
}

export class TransferInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransferInvalidStateError';
  }
}
