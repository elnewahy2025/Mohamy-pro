import { DocumentService } from './document.service';
import {
  DocumentAccessDeniedError,
  DocumentInvalidStateError,
  DocumentNotFoundError,
} from './document.errors';

describe('DocumentService', () => {
  let service: DocumentService;

  beforeEach(() => {
    service = new DocumentService();
  });

  describe('createDocument', () => {
    it('creates a document with a tenant-scoped version in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }) },
        document: {
          create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
        },
      } as any;

      const created = await service.createDocument(
        tx as any,
        'tenant-1',
        'uploader-1',
        {
          caseId: 'case-1',
          clientId: 'client-1',
          title: 'Contract',
          mimeType: 'application/pdf',
          fileSize: 1024n,
        } as any,
      );

      expect(created).toEqual({ id: 'doc-1' });
      // The nested DocumentVersion must carry the tenantId so FORCE RLS passes.
      const data = (tx.document.create as jest.Mock).mock.calls[0][0].data;
      expect(data.tenantId).toBe('tenant-1');
      expect(data.versions.create.tenantId).toBe('tenant-1');
    });

    it('rejects a document whose case is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createDocument(tx as any, 'tenant-1', 'uploader-1', {
          caseId: 'case-foreign',
          title: 'X',
        } as any),
      ).rejects.toBeInstanceOf(DocumentAccessDeniedError);
    });

    it('rejects a document whose client is not in the tenant', async () => {
      const tx = {
        case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
        client: { findFirst: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.createDocument(tx as any, 'tenant-1', 'uploader-1', {
          caseId: 'case-1',
          clientId: 'client-foreign',
          title: 'X',
        } as any),
      ).rejects.toBeInstanceOf(DocumentAccessDeniedError);
    });
  });

  describe('uploadNewVersion', () => {
    it('creates a tenant-scoped next version', async () => {
      const tx = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            tenantId: 'tenant-1',
            status: 'FINAL',
            versions: [{ versionNumber: 3 }],
          }),
        },
        documentVersion: {
          create: jest
            .fn()
            .mockResolvedValue({ id: 'ver-4', versionNumber: 4 }),
        },
      } as any;

      const result = await service.uploadNewVersion(
        tx as any,
        'tenant-1',
        'doc-1',
        'uploader-1',
        { storageObjectId: 'obj-1' } as any,
      );

      expect(result.versionNumber).toBe(4);
      expect(tx.documentVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 'tenant-1' }),
      });
    });

    it('rejects versioning an archived document', async () => {
      const tx = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            tenantId: 'tenant-1',
            status: 'ARCHIVED',
            versions: [],
          }),
        },
      } as any;

      await expect(
        service.uploadNewVersion(tx as any, 'tenant-1', 'doc-1', 'uploader-1', {
          storageObjectId: 'obj-1',
        } as any),
      ).rejects.toBeInstanceOf(DocumentInvalidStateError);
    });
  });

  describe('shareDocument', () => {
    it('creates a tenant-scoped share record', async () => {
      const tx = {
        document: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'doc-1',
            tenantId: 'tenant-1',
            status: 'FINAL',
          }),
        },
        documentShare: {
          create: jest.fn().mockResolvedValue({ id: 'share-1' }),
        },
      } as any;

      const result = await service.shareDocument(
        tx as any,
        'tenant-1',
        'doc-1',
        'sharer-1',
        { sharedWithEmail: 'a@b.com' } as any,
      );

      expect(result).toEqual({ id: 'share-1' });
      expect(tx.documentShare.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ tenantId: 'tenant-1' }),
      });
    });

    it('rejects when the document is not in the tenant', async () => {
      const tx = {
        document: { findUnique: jest.fn().mockResolvedValue(null) },
      } as any;

      await expect(
        service.shareDocument(
          tx as any,
          'tenant-1',
          'doc-foreign',
          'sharer-1',
          { sharedWithEmail: 'a@b.com' } as any,
        ),
      ).rejects.toBeInstanceOf(DocumentNotFoundError);
    });
  });
});
