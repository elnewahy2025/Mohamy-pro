import { Global, Module } from '@nestjs/common';
import { OutboxModule } from '../outbox/outbox.module';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [OutboxModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
