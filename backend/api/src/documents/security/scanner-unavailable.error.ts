export class ScannerUnavailableError extends Error {
  constructor() {
    super(
      'ClamAV daemon is not wired: use ClamAvMalwareScanner (infrastructure/storage) for real scans',
    );
    this.name = 'ScannerUnavailableError';
  }
}
