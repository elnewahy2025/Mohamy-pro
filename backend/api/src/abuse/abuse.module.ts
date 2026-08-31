import { Module } from '@nestjs/common';
import { AbuseControlService } from './abuse-control.service';
import { AbuseCounterService } from './abuse-counter.service';

/**
 * Bundles the Phase 2 abuse-control primitives and the orchestration layer.
 * Exporting `AbuseControlService` lets Auth (login / tenant-switch / MFA) and
 * Membership (invitation acceptance) enforce the same policies consistently.
 */
@Module({
  providers: [AbuseCounterService, AbuseControlService],
  exports: [AbuseControlService],
})
export class AbuseModule {}
