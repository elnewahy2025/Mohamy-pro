import { ClamAvScanner } from './clamav.scanner';
import { ScannerUnavailableError } from '../scanner-unavailable.error';

describe('ClamAvScanner', () => {
  it('fails closed instead of reporting a fabricated CLEAN result', async () => {
    const scanner = new ClamAvScanner();

    await expect(scanner.scan({} as any)).rejects.toBeInstanceOf(
      ScannerUnavailableError,
    );
  });
});
