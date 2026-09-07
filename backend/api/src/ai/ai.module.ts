import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiOperations } from './ai.operations';
import { AiRequestService } from './request.service';
import { AiReviewService } from './review.service';
import { RetrievalService } from './retrieval.service';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [AiController],
  providers: [
    AiOperations,
    AiRequestService,
    AiReviewService,
    RetrievalService,
  ],
})
export class AiModule {}
