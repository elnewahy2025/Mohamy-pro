import { IntakeService } from './intake.service';
import { IntakeInvalidStateError, IntakeNotFoundError } from './intake.errors';

function base(dto: Record<string, unknown> = {}) {
  return {
    fullName: 'Layla Haddad',
    clientType: 'INDIVIDUAL',
    matterSummary: 'Contract dispute over delivery terms.',
    ...dto,
  } as any;
}

describe('IntakeService', () => {
  it('rejects links to conflict checks outside the tenant', async () => {
    const tx = {
      conflictCheck: { findFirst: jest.fn().mockResolvedValue(null) },
      intakeRequest: { create: jest.fn() },
    };
    const service = new IntakeService();

    await expect(
      service.create(tx as any, 't1', 'u1', base({ conflictCheckId: 'c9' })),
    ).rejects.toBeInstanceOf(IntakeInvalidStateError);
    expect(tx.intakeRequest.create).not.toHaveBeenCalled();
  });

  it('creates requests linked to in-tenant conflict checks', async () => {
    const tx = {
      conflictCheck: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
      intakeRequest: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'i1',
          status: 'NEW',
          ...data,
        })),
      },
    };
    const service = new IntakeService();

    const created: any = await service.create(
      tx as any,
      't1',
      'u1',
      base({ conflictCheckId: 'c1' }),
    );

    expect(created.tenantId).toBe('t1');
    expect(created.status).toBe('NEW');
    expect(created.createdBy).toBe('u1');
  });

  it('throws not-found for missing requests', async () => {
    const tx = {
      intakeRequest: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new IntakeService();

    await expect(
      service.get(tx as any, 't1', 'missing'),
    ).rejects.toBeInstanceOf(IntakeNotFoundError);
  });

  it('moves only NEW requests to review', async () => {
    const tx = {
      intakeRequest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'i1',
          status: 'APPROVED',
          reviewNotes: null,
        }),
        update: jest.fn(),
      },
    };
    const service = new IntakeService();

    await expect(
      service.markInReview(tx as any, 't1', 'm1', 'i1'),
    ).rejects.toBeInstanceOf(IntakeInvalidStateError);
    expect(tx.intakeRequest.update).not.toHaveBeenCalled();
  });
});
