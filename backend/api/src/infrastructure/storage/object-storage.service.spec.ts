import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import {
  prepareBodyForIntegrity,
  S3ObjectStorageService,
} from './object-storage.service';

describe('storage object integrity preparation', () => {
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

describe('S3ObjectStorageService - Malware Prevention', () => {
  let service: S3ObjectStorageService;
  let mockScanner: any;

  beforeEach(() => {
    mockScanner = {
      enabled: true,
      scanFile: jest.fn(),
    };

    const mockConfig = {
      getOrThrow: jest.fn((key) => {
        if (key === 'S3_VERSIONING_ENABLED' || key === 'S3_OBJECT_LOCK_ENABLED')
          return false;
        return 'mock-val';
      }),
      get: jest.fn(),
    } as any;

    const mockPrisma = {} as any;

    service = new S3ObjectStorageService(mockConfig, mockPrisma, mockScanner);
    // Suppress actual S3 calls
    (service as any).client = { send: jest.fn() };
  });

  it('throws an error (fails-closed) if the malware scanner returns INFECTED', async () => {
    mockScanner.scanFile.mockResolvedValue('INFECTED');

    await expect(
      service.putObject({
        tenantId: 'tenant-1',
        key: 'test.txt',
        body: Buffer.from('infected'),
        contentType: 'text/plain',
        sourcePath: '/tmp/infected',
      }),
    ).rejects.toThrow('Object rejected by malware scanning');
  });

  it('fails-closed if the malware scanner throws an unexpected error', async () => {
    mockScanner.scanFile.mockRejectedValue(new Error('Scanner down'));

    await expect(
      service.putObject({
        tenantId: 'tenant-1',
        key: 'test.txt',
        body: Buffer.from('file'),
        contentType: 'text/plain',
        sourcePath: '/tmp/file',
      }),
    ).rejects.toThrow('Scanner down');
  });
});
