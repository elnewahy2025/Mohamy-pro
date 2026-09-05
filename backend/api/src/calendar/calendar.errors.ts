export class CalendarAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarAccessDeniedError';
  }
}

export class CalendarNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarNotFoundError';
  }
}

export class CalendarInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarInvalidStateError';
  }
}
