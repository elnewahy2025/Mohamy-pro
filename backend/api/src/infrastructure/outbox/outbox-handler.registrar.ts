import { Injectable, OnModuleInit } from '@nestjs/common';
import { OutboxHandlerRegistry } from './outbox-handler.registry';
import {
  HEALTH_STATUS_UPDATED_EVENT,
  HealthStatusOutboxHandler,
} from './health-status-outbox.handler';
import {
  AUDIT_EVENT_CREATED_OUTBOX_EVENT,
  AuditOutboxHandler,
} from '../../audit/audit-outbox.handler';

@Injectable()
export class OutboxHandlerRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly healthStatusHandler: HealthStatusOutboxHandler,
    private readonly auditHandler: AuditOutboxHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(HEALTH_STATUS_UPDATED_EVENT, (message) =>
      this.healthStatusHandler.handle(message),
    );
    this.registry.register(AUDIT_EVENT_CREATED_OUTBOX_EVENT, (message) =>
      this.auditHandler.handle(message),
    );
  }
}
