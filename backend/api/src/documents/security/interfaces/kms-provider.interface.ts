export interface KmsProvider {
  /**
   * Generates a new data encryption key (DEK).
   * Returns the plaintext key (to be used for encryption) and the encrypted key (to be stored).
   */
  generateDataKey(): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
    keyReference: string;
  }>;

  /**
   * Decrypts a stored encrypted data key.
   */
  decryptDataKey(encryptedKey: string, keyReference: string): Promise<Buffer>;
}
