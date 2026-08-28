import type { Request } from 'express';
import type { SessionDetails } from './session/session.service';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Global augmentation of the Express Request type.
  namespace Express {
    interface Request {
      auth?: SessionDetails;
    }
  }
}

export {};
