import { Injectable, Logger } from '@nestjs/common';
import { KmsProvider } from '../interfaces/kms-provider.interface';
import { randomBytes } from 'crypto';

@Injectable()
export class VaultKmsProvider implements KmsProvider {
  private readonly logger = new Logger(VaultKmsProvider.name);

  // In production, inject a configured Vault client or HTTP service calling Vault Transit engine.
  // The transit engine endpoint would be /v1/transit/datakey/plaintext/:name

  async generateDataKey(): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
    keyReference: string;
  }> {
    this.logger.log('Generating new data key via Vault Transit...');

    // Simulate Vault Transit DataKey generation
    const plaintext = randomBytes(32); // 256-bit AES key
    const ciphertext = `vault:v1:${randomBytes(16).toString('hex')}`; // Simulated Vault ciphertext format

    return {
      plaintextKey: plaintext,
      encryptedKey: ciphertext,
      keyReference: 'mohamy-document-key', // The named key ring in Vault
    };
  }

  async decryptDataKey(
    encryptedKey: string,
    keyReference: string,
  ): Promise<Buffer> {
    this.logger.log(
      `Decrypting data key via Vault Transit using key ring: ${keyReference}`,
    );

    if (!encryptedKey.startsWith('vault:v1:')) {
      throw new Error('Invalid encrypted key format');
    }

    // Simulate Vault Transit decrypt
    // In production, send encryptedKey to /v1/transit/decrypt/:name
    const plaintext = randomBytes(32); // Simulated decrypted key
    return plaintext;
  }
}
