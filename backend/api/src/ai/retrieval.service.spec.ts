import { RetrievalService } from './retrieval.service';
import { AiInvalidStateError } from './ai.errors';

function service(assigned: string[] = ['case-1']) {
  const resourceAccess = {
    assignedCaseIds: jest.fn().mockResolvedValue(assigned),
  };
  return {
    resourceAccess,
    svc: new RetrievalService(resourceAccess as never),
  };
}

describe('RetrievalService', () => {
  it('rejects unknown ref kinds', async () => {
    const tx = {};
    const { svc } = service();

    await expect(
      svc.resolveRefs(tx as any, 't1', { scope: 'FULL', membershipId: 'm1' }, [
        { kind: 'WITNESS', id: 'w1' },
      ]),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
  });

  it('constrains case refs to assignments under ASSIGNED scope', async () => {
    const tx = {
      case: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const { svc } = service(['case-9']);

    await expect(
      svc.resolveRefs(
        tx as any,
        't1',
        { scope: 'ASSIGNED', membershipId: 'm1' },
        [{ kind: 'CASE', id: 'case-1' }],
      ),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
    expect(tx.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          id: { in: ['case-9'] },
        }),
      }),
    );
  });

  it('resolves in-scope refs to scalar snapshots only', async () => {
    const tx = {
      case: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'case-9',
          caseNumber: 'C-9',
          status: 'OPEN',
          tokenHash: 'must-not-leak',
        }),
      },
    };
    const { svc } = service(['case-9']);

    const [resolved] = await svc.resolveRefs(
      tx as any,
      't1',
      { scope: 'ASSIGNED', membershipId: 'm1' },
      [{ kind: 'CASE', id: 'case-9' }],
    );

    expect(resolved.snapshot).toEqual({
      id: 'case-9',
      caseNumber: 'C-9',
      status: 'OPEN',
      priority: null,
      openDate: null,
      practiceArea: null,
      caseType: null,
    });
    expect(resolved.snapshot).not.toHaveProperty('tokenHash');
  });
});

describe('RetrievalService unlinked documents', () => {
  it('denies case-unlinked documents under ASSIGNED scope', async () => {
    const tx = {
      document: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'd1', caseId: null, title: 'Loose' }),
      },
    };
    const resourceAccess = {
      assignedCaseIds: jest.fn().mockResolvedValue(['case-9']),
    };
    const svc = new RetrievalService(resourceAccess as never);

    await expect(
      svc.resolveRefs(
        tx as any,
        't1',
        { scope: 'ASSIGNED', membershipId: 'm1' },
        [{ kind: 'DOCUMENT', id: 'd1' }],
      ),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
  });

  it('allows case-unlinked documents under FULL scope', async () => {
    const tx = {
      document: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'd1',
          caseId: null,
          title: 'Loose',
          documentType: null,
          status: 'ACTIVE',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
    };
    const resourceAccess = { assignedCaseIds: jest.fn() };
    const svc = new RetrievalService(resourceAccess as never);

    const [resolved] = await svc.resolveRefs(
      tx as any,
      't1',
      { scope: 'FULL', membershipId: 'm1' },
      [{ kind: 'DOCUMENT', id: 'd1' }],
    );

    expect(resourceAccess.assignedCaseIds).not.toHaveBeenCalled();
    expect(resolved.snapshot.title).toBe('Loose');
  });
});
