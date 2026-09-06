import { Module } from '@nestjs/common';
import { TransferController } from './transfer.controller';
import { TransferOperations } from './transfer.operations';
import { ImportService } from './import.service';
import { ExportService } from './export.service';
import { TransferWorkerProcessor } from './transfer-worker.processor';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DatabaseModule, AuditModule, PermissionsModule, AuthModule],
  controllers: [TransferController],
  providers: [
    TransferOperations,
    ImportService,
    ExportService,
    TransferWorkerProcessor,
  ],
  exports: [ImportService, ExportService],
})
export class TransferModule {}
