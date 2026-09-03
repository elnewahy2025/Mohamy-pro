import { type Prisma } from '@prisma/client';
import {
  type CasePartyLink,
  type CasePartyLinker,
} from './case-party.contract';

class MockCasePartyLinker implements CasePartyLinker {
  private links: CasePartyLink[] = [];

  async linkPartyToCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
    roleId: string,
  ): Promise<CasePartyLink> {
    if (!caseId || !partyId || !roleId) {
      throw new Error('Missing required arguments');
    }
    const link: CasePartyLink = {
      id: 'mock-link-id',
      tenantId: 'mock-tenant-id',
      caseId,
      partyId,
      roleId,
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.links.push(link);
    return link;
  }

  async unlinkPartyFromCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
    roleId: string,
  ): Promise<void> {
    const idx = this.links.findIndex(
      (l) =>
        l.caseId === caseId && l.partyId === partyId && l.roleId === roleId,
    );
    if (idx !== -1) {
      this.links.splice(idx, 1);
    }
  }

  async listPartyRolesForCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
  ): Promise<CasePartyLink[]> {
    return this.links.filter(
      (l) => l.caseId === caseId && l.partyId === partyId,
    );
  }
}

describe('CasePartyLinker Contract', () => {
  let linker: CasePartyLinker;
  const mockTx = {} as Prisma.TransactionClient;

  beforeEach(() => {
    linker = new MockCasePartyLinker();
  });

  it('should link a party to a case with a role', async () => {
    const link = await linker.linkPartyToCase(
      mockTx,
      'case-1',
      'party-1',
      'role-1',
    );
    expect(link.caseId).toBe('case-1');
    expect(link.partyId).toBe('party-1');
    expect(link.roleId).toBe('role-1');

    const roles = await linker.listPartyRolesForCase(
      mockTx,
      'case-1',
      'party-1',
    );
    expect(roles).toHaveLength(1);
    expect(roles[0].roleId).toBe('role-1');
  });

  it('should unlink a party from a case', async () => {
    await linker.linkPartyToCase(mockTx, 'case-1', 'party-1', 'role-1');
    let roles = await linker.listPartyRolesForCase(mockTx, 'case-1', 'party-1');
    expect(roles).toHaveLength(1);

    await linker.unlinkPartyFromCase(mockTx, 'case-1', 'party-1', 'role-1');
    roles = await linker.listPartyRolesForCase(mockTx, 'case-1', 'party-1');
    expect(roles).toHaveLength(0);
  });
});
