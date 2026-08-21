import { AsyncLocalStorage } from 'node:async_hooks';

export interface CorrelationContext {
  correlationId: string;
}

export const correlationContext = new AsyncLocalStorage<CorrelationContext>();

export function getActiveCorrelationId(): string | undefined {
  return correlationContext.getStore()?.correlationId;
}
