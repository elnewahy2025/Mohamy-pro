import { Injectable, OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import {
  HEALTH_STATUS_UPDATED_EVENT,
  HealthStatusOutboxHandler,
} from './health-status-outbox.handler';
import {
  AUDIT_OUTBOX_EVENT_TYPES,
  AuditOutboxHandler,
} from './audit-outbox.handler';

@Injectable()
export class OutboxHandlerRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly healthStatusHandler: HealthStatusOutboxHandler,
    private readonly auditHandler: AuditOutboxHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      HEALTH_STATUS_UPDATED_EVENT,
      (message, transaction) =>
        this.healthStatusHandler.handle(message, transaction),
    );
    for (const eventType of AUDIT_OUTBOX_EVENT_TYPES) {
      this.registry.register(eventType, (message, transaction) =>
        this.auditHandler.handle(message, transaction),
      );
    }
  }
}
