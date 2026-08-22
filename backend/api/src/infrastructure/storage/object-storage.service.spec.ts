import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  buildTenantObjectKey,
  prepareBodyForIntegrity,
} from './object-storage.service';

describe('storage object integrity and tenant key boundary', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  it('builds a server-prefixed tenant object key', () => {
    expect(buildTenantObjectKey(tenantId, 'documents/contract.pdf')).toBe(
      `tenants/${tenantId}/documents/contract.pdf`,
    );
  });

  it('rejects unsafe or malformed object keys before upload', () => {
    expect(() => buildTenantObjectKey('not-a-uuid', 'contract.pdf')).toThrow(
      'tenantId',
    );
    expect(() => buildTenantObjectKey(tenantId, '../contract.pdf')).toThrow(
      'Storage object key is invalid',
    );
    expect(() => buildTenantObjectKey(tenantId, '/contract.pdf')).toThrow(
      'Storage object key is invalid',
    );
  });

  it('calculates SHA-256 and byte count for a buffer', () => {
    const body = Buffer.from('Mohamy Pro storage integrity', 'utf8');
    const prepared = prepareBodyForIntegrity(body);

    expect(prepared.body).toStrictEqual(body);
    expect(prepared.finalize()).toEqual({
      sha256: createHash('sha256').update(body).digest('hex'),
      sizeBytes: BigInt(body.length),
    });
  });

  it('calculates SHA-256 and byte count while forwarding a stream', async () => {
    const chunks = [
      Buffer.from('legal-', 'utf8'),
      Buffer.from('record', 'utf8'),
    ];
    const prepared = prepareBodyForIntegrity(Readable.from(chunks));
    const received: Buffer[] = [];
    const stream = prepared.body as Readable;

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => received.push(chunk));
      stream.once('end', resolve);
      stream.once('error', reject);
    });

    const body = Buffer.concat(received);
    expect(body.toString('utf8')).toBe('legal-record');
    expect(prepared.finalize()).toEqual({
      sha256: createHash('sha256').update(body).digest('hex'),
      sizeBytes: BigInt(body.length),
    });
  });
});
