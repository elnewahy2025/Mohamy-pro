import { Global, Module } from '@nestjs/common';
import { ClamAvMalwareScanner } from './clamav-malware-scanner.service';
import { S3ObjectStorageService } from './object-storage.service';

@Global()
@Module({
  providers: [
    ClamAvMalwareScanner,
    S3ObjectStorageService,
    {
      provide: 'OBJECT_STORAGE',
      useExisting: S3ObjectStorageService,
    },
  ],
  exports: [S3ObjectStorageService, 'OBJECT_STORAGE'],
})
export class StorageModule {}
