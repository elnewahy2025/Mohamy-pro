import { ConflictGateService } from './conflict-gate.service';

const g = () => new ConflictGateService();

function tx(
  blockedChecks: { id: string; reason: string | null }[],
  parties: { name: string }[],
) {
  return {
    conflictCheck: {
      findMany: jest.fn().mockResolvedValue(blockedChecks),
    },
    conflictParty: {
      findMany: jest.fn().mockResolvedValue(parties),
    },
  } as never;
}

describe('ConflictGateService', () => {
  it('returns cleared=true when no completed BLOCK check matches', async () => {
    const t = tx([], []);
    const verdict = await g().assertClearForCase(t, 'tenant-1', [
      { name: 'Acme Corp' },
    ]);
    expect(verdict.cleared).toBe(true);
    expect(verdict.blocks).toEqual([]);
  });

  it('returns cleared=true when no prospective parties are provided', async () => {
    const t = tx([], []);
    const verdict = await g().assertClearForCase(t, 'tenant-1', []);
    expect(verdict.cleared).toBe(true);
    expect(verdict.blocks).toEqual([]);
  });

  it('returns cleared=false when a BLOCKed check matches a prospective party', async () => {
    const t = tx(
      [{ id: 'cc1', reason: 'competitor representation' }],
      [{ name: 'Acme Corp' }],
    );
    const verdict = await g().assertClearForCase(t, 'tenant-1', [
      { name: 'acme corp' },
    ]);
    expect(verdict.cleared).toBe(false);
    expect(verdict.blocks).toHaveLength(1);
    expect(verdict.blocks[0].conflictCheckId).toBe('cc1');
    expect(verdict.blocks[0].reason).toBe('competitor representation');
  });

  it('normalizes case/whitespace when matching party names', () => {
    expect(g().normalize('  Acme   Corp  ')).toBe('acme corp');
  });
});
