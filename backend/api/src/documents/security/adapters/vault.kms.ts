import { Injectable, Logger } from '@nestjs/common';
import { KmsProvider } from '../interfaces/kms-provider.interface';
import { KmsUnavailableError } from '../kms-unavailable.error';

@Injectable()
export class VaultKmsProvider implements KmsProvider {
  private readonly logger = new Logger(VaultKmsProvider.name);

  // Vault Transit is not connected (Phase 16 scaffold). Both methods fail
  // closed: fabricated ciphertext would be unrecoverable and unprotected.

  async generateDataKey(): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
    keyReference: string;
  }> {
    this.logger.error('Data-key generation called without Vault Transit');
    throw new KmsUnavailableError();
  }

  async decryptDataKey(
    encryptedKey: string,
    keyReference: string,
  ): Promise<Buffer> {
    void encryptedKey;
    void keyReference;
    this.logger.error('Data-key decryption called without Vault Transit');
    throw new KmsUnavailableError();
  }
}
