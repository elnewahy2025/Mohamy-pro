export class PartyAccessDeniedError extends Error {
  constructor(message = 'Access to party denied') {
    super(message);
    this.name = 'PartyAccessDeniedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
