export class CaseTimelineAccessDeniedError extends Error {
  constructor(message = 'Case timeline not found or access denied') {
    super(message);
    this.name = 'CaseTimelineAccessDeniedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
