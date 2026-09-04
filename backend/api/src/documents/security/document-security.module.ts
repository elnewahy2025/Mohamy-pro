import { Module } from '@nestjs/common';
import { DocumentSecurityService } from './document-security.service';
import { SignedAccessService } from './signed-access.service';
import { SecurityAuditService } from './security-audit.service';
import { ClamAvScanner } from './adapters/clamav.scanner';
import { VaultKmsProvider } from './adapters/vault.kms';
import { DocumentSecurityController } from './document-security.controller';

@Module({
  controllers: [DocumentSecurityController],
  providers: [
    DocumentSecurityService,
    SignedAccessService,
    SecurityAuditService,
    ClamAvScanner,
    VaultKmsProvider,
    {
      provide: 'MalwareScanner',
      useClass: ClamAvScanner,
    },
    {
      provide: 'KmsProvider',
      useClass: VaultKmsProvider,
    },
  ],
  exports: [DocumentSecurityService, SignedAccessService, SecurityAuditService],
})
export class DocumentSecurityModule {}
