import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const SESSION_KEY_VERSION = 'v1';
const AES_ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function deriveDataKey(secret: string): Buffer {
  const derived = hkdfSync(
    'sha256',
    Buffer.from(secret),
    Buffer.from('mohamy-session'),
    Buffer.from('data-encryption'),
    KEY_BYTES,
  );
  return Buffer.from(derived);
}

export function encryptSecret(secret: string, plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(AES_ALGORITHM, deriveDataKey(secret), iv, {
    authTagLength: TAG_BYTES,
  });
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    SESSION_KEY_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
}

export function decryptSecret(
  secret: string,
  ciphertext: string,
): string | null {
  const [version, ivPart, tagPart, dataPart] = ciphertext.split('.');
  if (version !== SESSION_KEY_VERSION || !ivPart || !tagPart || !dataPart) {
    return null;
  }
  try {
    const decipher = createDecipheriv(
      AES_ALGORITHM,
      deriveDataKey(secret),
      Buffer.from(ivPart, 'base64url'),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
