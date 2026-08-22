import { SessionCryptoService } from './session-crypto.service';

function config(value?: string) {
  return {
    get: jest.fn().mockReturnValue(value),
  } as never;
}

describe('SessionCryptoService', () => {
  const key = Buffer.alloc(32, 9).toString('base64url');

  it('encrypts and decrypts a provider refresh token without storing plaintext', () => {
    const service = new SessionCryptoService(config(key));
    const plaintext = 'refresh-token-value-that-must-not-be-stored';
    const ciphertext = service.encrypt(plaintext);

    expect(ciphertext).not.toContain(plaintext);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(service.decrypt(ciphertext)).toBe(plaintext);
  });

  it('rejects tampered ciphertext', () => {
    const service = new SessionCryptoService(config(key));
    const ciphertext = service.encrypt('refresh-token');
    const parts = ciphertext.split('.');
    parts[3] = `${parts[3]}A`;

    expect(() => service.decrypt(parts.join('.'))).toThrow(
      'Encrypted session value failed authentication',
    );
  });

  it('rejects malformed ciphertext and missing keys', () => {
    const service = new SessionCryptoService(config(key));
    expect(() => service.decrypt('v1.invalid')).toThrow(
      'Encrypted session value is malformed',
    );
    expect(() => new SessionCryptoService(config()).encrypt('value')).toThrow(
      'SESSION_ENCRYPTION_KEY is required for session encryption',
    );
  });

  it('hashes values deterministically', () => {
    const service = new SessionCryptoService(config(key));
    expect(service.hash('session')).toBe(service.hash('session'));
    expect(service.hash('session')).not.toBe(service.hash('different'));
  });
});
