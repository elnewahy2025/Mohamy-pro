import { PortalService } from './portal.service';

describe('PortalService', () => {
  it('scopes every read to the linked client', async () => {
    const tx = {
      case: {
        findMany: jest.fn().mockResolvedValue([{ id: 'case-1' }]),
      },
      document: { findMany: jest.fn().mockResolvedValue([]) },
      hearing: { findMany: jest.fn().mockResolvedValue([]) },
      deadline: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
      invoice: { findMany: jest.fn().mockResolvedValue([]) },
      credit: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PortalService();

    await service.myCases(tx as any, 't1', 'cl1');
    expect(tx.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', clientId: 'cl1' }),
      }),
    );

    await service.myDocuments(tx as any, 't1', 'cl1');
    expect(tx.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', clientId: 'cl1' }),
      }),
    );

    await service.myInvoices(tx as any, 't1', 'cl1');
    expect(tx.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', clientId: 'cl1' }),
      }),
    );

    await service.myMessages(tx as any, 't1', 'cl1');
    expect(tx.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 't1', clientId: 'cl1' }),
      }),
    );
  });

  it('derives hearings and deadlines from own cases only', async () => {
    const tx = {
      case: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'case-1' }, { id: 'case-2' }]),
      },
      hearing: { findMany: jest.fn().mockResolvedValue([]) },
      deadline: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new PortalService();

    await service.myHearings(tx as any, 't1', 'cl1');
    expect(tx.hearing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          caseId: { in: ['case-1', 'case-2'] },
        }),
      }),
    );

    await service.myDeadlines(tx as any, 't1', 'cl1');
    expect(tx.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 't1',
          caseId: { in: ['case-1', 'case-2'] },
        }),
      }),
    );
  });

  it('builds a date-sorted agenda from own hearings and deadlines', async () => {
    const tx = {
      case: {
        findMany: jest.fn().mockResolvedValue([{ id: 'case-1' }]),
      },
      hearing: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'h1',
            date: new Date('2026-04-02T10:00:00Z'),
            status: 'SCHEDULED',
          },
        ]),
      },
      deadline: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'd1',
            title: 'Filing',
            dueDate: new Date('2026-04-01T10:00:00Z'),
          },
        ]),
      },
    };
    const service = new PortalService();

    const agenda = await service.agenda(tx as any, 't1', 'cl1');

    expect(agenda.map((a) => a.id)).toEqual(['d1', 'h1']);
  });
});
