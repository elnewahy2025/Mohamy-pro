export class DeadlineAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineAccessDeniedError';
  }
}

export class DeadlineNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineNotFoundError';
  }
}

export class DeadlineRuleNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineRuleNotFoundError';
  }
}

export class DeadlineInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeadlineInvalidStateError';
  }
}
