import { Injectable } from '@nestjs/common';
import type { OutboxMessage } from '@prisma/client';

export type OutboxHandler = (message: OutboxMessage) => Promise<void>;

@Injectable()
export class OutboxHandlerRegistry {
  private readonly handlers = new Map<string, OutboxHandler>();

  register(eventType: string, handler: OutboxHandler): void {
    if (this.handlers.has(eventType)) {
      throw new Error(
        `An outbox handler is already registered for event type ${eventType}`,
      );
    }
    this.handlers.set(eventType, handler);
  }

  resolve(eventType: string): OutboxHandler {
    const handler = this.handlers.get(eventType);
    if (!handler) {
      throw new Error(
        `No outbox handler registered for event type ${eventType}`,
      );
    }
    return handler;
  }
}
