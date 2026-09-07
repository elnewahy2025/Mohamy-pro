import { AiReviewService } from './review.service';
import { AiRequestService } from './request.service';
import { RetrievalService } from './retrieval.service';
import { AiInvalidStateError } from './ai.errors';

function service(request: Record<string, unknown>) {
  const tx = {
    aiRequest: {
      findFirst: jest.fn().mockResolvedValue({ id: 'a1', ...request }),
      update: jest.fn().mockImplementation(({ data }: any) => ({ ...data })),
    },
  };
  const retrieval = { resolveRefs: jest.fn() };
  return {
    tx,
    svc: new AiReviewService(
      new AiRequestService(retrieval as unknown as RetrievalService),
    ),
  };
}

describe('AiReviewService', () => {
  it('refuses to approve requests without provider output', async () => {
    const { tx, svc } = service({
      status: 'QUEUED',
      outputText: null,
      reviewNotes: null,
    });

    await expect(
      svc.approve(tx as any, 't1', 'm1', 'a1'),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
    expect(tx.aiRequest.update).not.toHaveBeenCalled();
  });

  it('refuses to approve READY requests with empty output', async () => {
    const { tx, svc } = service({
      status: 'READY',
      outputText: null,
      reviewNotes: null,
    });

    await expect(
      svc.approve(tx as any, 't1', 'm1', 'a1'),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
    expect(tx.aiRequest.update).not.toHaveBeenCalled();
  });

  it('approves READY requests with output', async () => {
    const { tx, svc } = service({
      status: 'READY',
      outputText: 'Summary here.',
      reviewNotes: null,
    });

    const updated: any = await svc.approve(
      tx as any,
      't1',
      'm1',
      'a1',
      'Looks right',
    );

    expect(tx.aiRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id_tenantId: { id: 'a1', tenantId: 't1' } },
      }),
    );
    expect(updated.status).toBe('APPROVED');
    expect(updated.reviewedBy).toBe('m1');
  });

  it('rejects queued requests with a reason', async () => {
    const { tx, svc } = service({
      status: 'QUEUED',
      outputText: null,
      reviewNotes: null,
    });

    const updated: any = await svc.reject(
      tx as any,
      't1',
      'm1',
      'a1',
      'Off brief',
    );

    expect(updated.status).toBe('REJECTED');
    expect(updated.reviewNotes).toBe('Off brief');
  });

  it('refuses to reject settled requests', async () => {
    const { tx, svc } = service({
      status: 'APPROVED',
      outputText: 'x',
      reviewNotes: null,
    });

    await expect(
      svc.reject(tx as any, 't1', 'm1', 'a1', 'Too late'),
    ).rejects.toBeInstanceOf(AiInvalidStateError);
  });
});
