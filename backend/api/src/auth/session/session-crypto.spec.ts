import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashToken,
} from './session-crypto';

const SECRET = 'unit-test-session-secret-that-is-long-enough-0000';

describe('session crypto', () => {
  it('generates opaque unique tokens', () => {
    const a = generateOpaqueToken();
    const b = generateOpaqueToken();
    expect(a).not.toBe(b);
    expect(a).toBeTruthy();
  });

  it('hashes tokens deterministically with sha256', () => {
    const token = 'some-token';
    expect(hashToken(token)).toHaveLength(64);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken('other-token'));
  });

  it('compares strings in constant time', () => {
    expect(constantTimeEqual('a', 'a')).toBe(true);
    expect(constantTimeEqual('a', 'b')).toBe(false);
    expect(constantTimeEqual('abc', 'abcabc')).toBe(false);
  });

  it('round-trips an encrypted secret', () => {
    const plaintext = JSON.stringify({ state: 's', nonce: 'n', v: 'c' });
    const ciphertext = encryptSecret(SECRET, plaintext);
    expect(ciphertext.startsWith('v1.')).toBe(true);
    expect(decryptSecret(SECRET, ciphertext)).toBe(plaintext);
  });

  it('fails to decrypt with a different secret', () => {
    const ciphertext = encryptSecret(SECRET, 'payload');
    expect(
      decryptSecret('another-secret-that-is-long-enough-000000', ciphertext),
    ).toBeNull();
  });

  it('fails to decrypt a tampered ciphertext', () => {
    const ciphertext = encryptSecret(SECRET, 'payload');
    const parts = ciphertext.split('.');
    parts[2] = Buffer.from('0000000000000000').toString('base64url');
    expect(decryptSecret(SECRET, parts.join('.'))).toBeNull();
  });

  it('rejects malformed ciphertext', () => {
    expect(decryptSecret(SECRET, '')).toBeNull();
    expect(decryptSecret(SECRET, 'v2.abc')).toBeNull();
    expect(decryptSecret(SECRET, 'nope')).toBeNull();
  });
});
