export class NotificationAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationAccessDeniedError';
  }
}

export class NotificationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationNotFoundError';
  }
}

export class NotificationInvalidStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotificationInvalidStateError';
  }
}
