import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { DocumentOperations } from './document.operations';
import { DatabaseModule } from '../infrastructure/database/database.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuthModule } from '../auth/auth.module';
import { DocumentSecurityModule } from './security/document-security.module';
import { OcrModule } from './ocr/ocr.module';

@Module({
  imports: [
    DatabaseModule,
    AuditModule,
    PermissionsModule,
    AuthModule,
    DocumentSecurityModule,
    OcrModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentOperations],
  exports: [DocumentService, DocumentOperations],
})
export class DocumentModule {}
