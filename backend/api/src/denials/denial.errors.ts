export class DenialAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DenialAccessDeniedError';
  }
}

export class DenialNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DenialNotFoundError';
  }
}

export class DenialInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DenialInvalidStateError';
  }
}
