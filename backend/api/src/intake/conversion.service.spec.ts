import { ConversionService } from './conversion.service';
import { IntakeService } from './intake.service';
import { IntakeInvalidStateError } from './intake.errors';

function service(request: Record<string, unknown>, claimed = 1) {
  const tx = {
    intakeRequest: {
      findFirst: jest.fn().mockResolvedValue({ id: 'i1', ...request }),
      updateMany: jest.fn().mockResolvedValue({ count: claimed }),
      update: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ status: 'APPROVED', ...data })),
    },
    client: {
      create: jest
        .fn()
        .mockImplementation(({ data }: any) => ({ id: 'c1', ...data })),
    },
  };
  return { tx, svc: new ConversionService(new IntakeService()) };
}

const pending = {
  status: 'NEW',
  fullName: 'Layla Haddad',
  clientType: 'INDIVIDUAL',
  matterSummary: 'Contract dispute.',
  reviewNotes: null,
};

describe('ConversionService', () => {
  it('approves by creating an INTAKE-sourced client', async () => {
    const { tx, svc } = service(pending);

    const updated: any = await svc.approve(tx as any, 't1', 'm1', 'i1');

    expect(tx.client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 't1',
          name: 'Layla Haddad',
          source: 'INTAKE',
        }),
      }),
    );
    expect(updated.status).toBe('APPROVED');
    expect(updated.createdClientId).toBe('c1');
    expect(updated.reviewerMembershipId).toBe('m1');
  });

  it('refuses to approve settled requests', async () => {
    const { tx, svc } = service({ ...pending, status: 'REJECTED' });

    await expect(
      svc.approve(tx as any, 't1', 'm1', 'i1'),
    ).rejects.toBeInstanceOf(IntakeInvalidStateError);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('rejects with a mandatory reason', async () => {
    const { tx, svc } = service(pending);

    const updated: any = await svc.reject(
      tx as any,
      't1',
      'm1',
      'i1',
      'Conflict found',
    );

    expect(updated.status).toBe('REJECTED');
    expect(updated.rejectionReason).toBe('Conflict found');
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it('refuses to reject approved requests', async () => {
    const { tx, svc } = service({ ...pending, status: 'APPROVED' });

    await expect(
      svc.reject(tx as any, 't1', 'm1', 'i1', 'Too late'),
    ).rejects.toBeInstanceOf(IntakeInvalidStateError);
  });

  it('loses the race gracefully when another reviewer claims first', async () => {
    const { tx, svc } = service(pending, 0);

    await expect(
      svc.approve(tx as any, 't1', 'm1', 'i1'),
    ).rejects.toBeInstanceOf(IntakeInvalidStateError);
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.intakeRequest.update).not.toHaveBeenCalled();
  });
});
