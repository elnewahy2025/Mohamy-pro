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
import {
  INVITATION_CREATED_OUTBOX_EVENT,
  InvitationOutboxHandler,
} from '../../membership/invitation/invitation-outbox.handler';

@Injectable()
export class OutboxHandlerRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: OutboxHandlerRegistry,
    private readonly healthStatusHandler: HealthStatusOutboxHandler,
    private readonly auditHandler: AuditOutboxHandler,
    private readonly invitationHandler: InvitationOutboxHandler,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      HEALTH_STATUS_UPDATED_EVENT,
      (message, transaction) =>
        this.healthStatusHandler.handle(message, transaction),
    );
    this.registry.register(
      AUDIT_EVENT_CREATED_OUTBOX_EVENT,
      (message, transaction) => this.auditHandler.handle(message, transaction),
    );
    this.registry.register(
      INVITATION_CREATED_OUTBOX_EVENT,
      (message, transaction) =>
        this.invitationHandler.handle(message, transaction),
    );
  }
}
