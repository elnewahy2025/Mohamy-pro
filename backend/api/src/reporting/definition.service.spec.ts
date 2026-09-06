import { DefinitionService } from './definition.service';
import { ReportingInvalidStateError } from './reporting.errors';

describe('DefinitionService', () => {
  it('rejects non-allowlisted columns', async () => {
    const tx = { reportDefinition: { create: jest.fn() } };
    const service = new DefinitionService();

    await expect(
      service.create(tx as any, 't1', 'u1', {
        name: 'Bad',
        dataSource: 'CASE',
        columns: ['tokenHash'],
      } as any),
    ).rejects.toBeInstanceOf(ReportingInvalidStateError);
    expect(tx.reportDefinition.create).not.toHaveBeenCalled();
  });

  it('creates definitions with validated columns', async () => {
    const tx = {
      reportDefinition: {
        create: jest.fn().mockImplementation(({ data }: any) => ({
          id: 'r1',
          ...data,
        })),
      },
    };
    const service = new DefinitionService();

    const created: any = await service.create(tx as any, 't1', 'u1', {
      name: 'Open cases',
      dataSource: 'CASE',
      columns: ['caseNumber', 'status'],
    } as any);

    expect(created.tenantId).toBe('t1');
    expect(created.createdBy).toBe('u1');
  });
});

describe('DefinitionService field validation', () => {
  it('rejects non-allowlisted groupBy and sortBy', async () => {
    const tx = { reportDefinition: { create: jest.fn() } };
    const service = new DefinitionService();

    await expect(
      service.create(tx as any, 't1', 'u1', {
        name: 'Bad group',
        dataSource: 'CASE',
        columns: ['caseNumber'],
        groupBy: 'tokenHash',
      } as any),
    ).rejects.toBeInstanceOf(ReportingInvalidStateError);

    await expect(
      service.create(tx as any, 't1', 'u1', {
        name: 'Bad sort',
        dataSource: 'CASE',
        columns: ['caseNumber'],
        sortBy: 'passwordHash',
      } as any),
    ).rejects.toBeInstanceOf(ReportingInvalidStateError);
    expect(tx.reportDefinition.create).not.toHaveBeenCalled();
  });

  it('rejects filter keys outside the allowlist', async () => {
    const tx = { reportDefinition: { create: jest.fn() } };
    const service = new DefinitionService();

    await expect(
      service.create(tx as any, 't1', 'u1', {
        name: 'Bad filter',
        dataSource: 'CASE',
        columns: ['caseNumber'],
        filters: { sessionToken: 'x' },
      } as any),
    ).rejects.toBeInstanceOf(ReportingInvalidStateError);
    expect(tx.reportDefinition.create).not.toHaveBeenCalled();
  });

  it('accepts vetted columns for the newly covered sources', async () => {
    const tx = {
      reportDefinition: {
        create: jest.fn().mockImplementation(({ data }: any) => data),
      },
    };
    const service = new DefinitionService();

    for (const [source, columns] of [
      ['INVOICE', ['invoiceNumber', 'total', 'status']],
      ['PAYMENT', ['amount', 'status']],
      ['HEARING', ['date', 'status']],
      ['DEADLINE', ['title', 'dueDate']],
      ['DOCUMENT', ['title', 'documentType']],
    ] as const) {
      const created: any = await service.create(tx as any, 't1', 'u1', {
        name: `${source} report`,
        dataSource: source,
        columns: [...columns],
      } as any);
      expect(created.dataSource).toBe(source);
    }
  });
});
