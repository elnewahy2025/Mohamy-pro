import { AiRequestService } from './request.service';
import { RetrievalService } from './retrieval.service';
import { AiInvalidStateError, AiNotFoundError } from './ai.errors';

function service() {
  const retrieval = {
    resolveRefs: jest
      .fn()
      .mockResolvedValue([{ kind: 'CASE', id: 'c1', snapshot: {} }]),
  };
  return {
    retrieval,
    svc: new AiRequestService(retrieval as unknown as RetrievalService),
  };
}

describe('AiRequestService', () => {
  it('rejects unknown task types before touching refs', async () => {
    const tx = { aiRequest: { create: jest.fn() } };
    const { retrieval, svc } = service();

    await expect(
      svc.create(tx as any, 't1', 'u1', { scope: 'FULL', membershipId: 'm1' }, {
        taskType: 'WRITE_BRIEF',
        refs: [{ kind: 'CASE', id: 'c1' }],
      } as any),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
    expect(retrieval.resolveRefs).not.toHaveBeenCalled();
    expect(tx.aiRequest.create).not.toHaveBeenCalled();
  });

  it('creates queued requests after scoped ref validation', async () => {
    const tx = {
      aiRequest: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'a1',
          status: 'QUEUED',
          outputText: null,
          ...data,
        })),
      },
    };
    const { retrieval, svc } = service();

    const created: any = await svc.create(
      tx as any,
      't1',
      'u1',
      { scope: 'ASSIGNED', membershipId: 'm1' },
      {
        taskType: 'CASE_BRIEF',
        refs: [{ kind: 'CASE', id: 'c1' }],
      } as any,
    );

    expect(retrieval.resolveRefs).toHaveBeenCalledWith(
      tx,
      't1',
      { scope: 'ASSIGNED', membershipId: 'm1' },
      [{ kind: 'CASE', id: 'c1' }],
    );
    expect(created.status).toBe('QUEUED');
    expect(created.outputText).toBeNull();
    expect(created.requestedBy).toBe('u1');
  });

  it('throws not-found for missing requests', async () => {
    const tx = { aiRequest: { findFirst: jest.fn().mockResolvedValue(null) } };
    const { svc } = service();

    await expect(svc.get(tx as any, 't1', 'missing')).rejects.toBeInstanceOf(
      AiNotFoundError,
    );
  });
});

describe('AiRequestService scoping', () => {
  function scopedService() {
    const retrieval = { resolveRefs: jest.fn() };
    return {
      retrieval,
      svc: new AiRequestService(retrieval as unknown as RetrievalService),
    };
  }

  const assigned = { scope: 'ASSIGNED', membershipId: 'm1' } as const;

  it('hides out-of-scope requests from ASSIGNED lists', async () => {
    const tx = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'a1', refs: [{ kind: 'CASE', id: 'case-9' }] },
          { id: 'a2', refs: [{ kind: 'CASE', id: 'case-1' }] },
        ]),
      },
    };
    const { retrieval, svc } = scopedService();
    retrieval.resolveRefs.mockImplementation(
      (_tx: unknown, _t: unknown, _a: unknown, refs: Array<{ id: string }>) => {
        if (refs[0].id === 'case-1') throw new Error('out of scope');
        return Promise.resolve([]);
      },
    );

    const visible = await svc.list(tx as any, 't1', { ...assigned });

    expect(visible.map((r: { id: string }) => r.id)).toEqual(['a1']);
  });

  it('returns out-of-scope gets as not-found under ASSIGNED', async () => {
    const tx = {
      aiRequest: {
        findFirst: jest.fn().mockResolvedValue({ id: 'a2', refs: [] }),
      },
    };
    const { retrieval, svc } = scopedService();
    retrieval.resolveRefs.mockRejectedValue(new Error('out of scope'));

    await expect(
      svc.get(tx as any, 't1', 'a2', { ...assigned }),
    ).rejects.toBeInstanceOf(AiNotFoundError);
  });

  it('skips scope filtering for FULL lists', async () => {
    const tx = {
      aiRequest: {
        findMany: jest.fn().mockResolvedValue([{ id: 'a1', refs: [] }]),
      },
    };
    const { retrieval, svc } = scopedService();

    const visible = await svc.list(tx as any, 't1', {
      scope: 'FULL',
      membershipId: 'm1',
    });

    expect(retrieval.resolveRefs).not.toHaveBeenCalled();
    expect(visible).toHaveLength(1);
  });
});
