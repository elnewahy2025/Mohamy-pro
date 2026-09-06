export class ReportingAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportingAccessDeniedError';
  }
}

export class ReportingNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportingNotFoundError';
  }
}

export class ReportingInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReportingInvalidStateError';
  }
}
