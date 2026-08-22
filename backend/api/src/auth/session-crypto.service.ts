import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ValidatedEnvironment } from '../config/env.validation';

const VERSION = 'v1';
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

@Injectable()
export class SessionCryptoService {
  constructor(
    private readonly config: ConfigService<ValidatedEnvironment, true>,
  ) {}

  hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  encrypt(value: string): string {
    const key = this.readKey();
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [VERSION, encode(iv), encode(authTag), encode(ciphertext)].join('.');
  }

  decrypt(value: string): string {
    const key = this.readKey();
    const parts = value.split('.');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      throw new Error('Encrypted session value is malformed');
    }
    const iv = decode(parts[1], IV_BYTES, 'IV');
    const authTag = decode(parts[2], AUTH_TAG_BYTES, 'authentication tag');
    const ciphertext = decode(parts[3], undefined, 'ciphertext');
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error('Encrypted session value failed authentication');
    }
  }

  private readKey(): Buffer {
    const encoded = this.config.get<string>('SESSION_ENCRYPTION_KEY');
    if (!encoded) {
      throw new Error(
        'SESSION_ENCRYPTION_KEY is required for session encryption',
      );
    }
    const key = Buffer.from(encoded, 'base64url');
    if (key.length !== KEY_BYTES) {
      throw new Error('SESSION_ENCRYPTION_KEY must decode to 32 bytes');
    }
    return key;
  }
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(
  value: string | undefined,
  expectedLength: number | undefined,
  label: string,
): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error(`Encrypted session ${label} is malformed`);
  }
  const decoded = Buffer.from(value, 'base64url');
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new Error(`Encrypted session ${label} has an invalid length`);
  }
  return decoded;
}
