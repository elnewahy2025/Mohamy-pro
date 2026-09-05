import { Injectable, Logger } from '@nestjs/common';
import type {
  MalwareScanner,
  ScanResult,
} from '../interfaces/malware-scanner.interface';
import { ScannerUnavailableError } from '../scanner-unavailable.error';

@Injectable()
export class ClamAvScanner implements MalwareScanner {
  private readonly logger = new Logger(ClamAvScanner.name);

  async scan(stream: NodeJS.ReadableStream): Promise<ScanResult> {
    void stream;
    this.logger.error(
      'ClamAvScanner.scan called without a daemon: refusing to report CLEAN',
    );
    throw new ScannerUnavailableError();
  }
}
