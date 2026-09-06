export class ComplianceAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceAccessDeniedError';
  }
}

export class ComplianceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceNotFoundError';
  }
}

export class ComplianceInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComplianceInvalidStateError';
  }
}
