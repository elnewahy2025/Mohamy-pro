export class HearingAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HearingAccessDeniedError';
  }
}

export class HearingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HearingNotFoundError';
  }
}

export class HearingInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HearingInvalidStateError';
  }
}
