import { VaultKmsProvider } from './vault.kms';
import { KmsUnavailableError } from '../kms-unavailable.error';

describe('VaultKmsProvider', () => {
  it('refuses to fabricate data keys', async () => {
    const kms = new VaultKmsProvider();

    await expect(kms.generateDataKey()).rejects.toBeInstanceOf(
      KmsUnavailableError,
    );
  });

  it('refuses to fabricate decryption results', async () => {
    const kms = new VaultKmsProvider();

    await expect(
      kms.decryptDataKey('vault:v1:deadbeef', 'mohamy-document-key'),
    ).rejects.toBeInstanceOf(KmsUnavailableError);
  });
});
