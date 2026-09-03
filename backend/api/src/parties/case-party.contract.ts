import { type Prisma } from '@prisma/client';

export interface CasePartyLink {
  id: string;
  tenantId: string;
  caseId: string;
  partyId: string;
  roleId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Phase 8 Contract: CasePartyLinker
 *
 * This interface describes the boundaries and expected semantics for linking
 * Parties to Cases. It is implemented in Phase 8 (Case Management).
 *
 * The implementation MUST guarantee:
 * 1. Tenant Scoping: All operations must run within the Prisma transaction context
 *    (which has RLS tenant constraints enforced via `withTenantContext`).
 * 2. Audit Semantics: Links and unlinks MUST emit audit events.
 * 3. Role Validation: `roleId` MUST point to a valid `PartyRole` within the same tenant.
 * 4. One-Primary-Role Rule: A party may have multiple roles on a single case, but
 *    often UI or business logic dictates a primary role; the implementer handles this.
 */
export interface CasePartyLinker {
  linkPartyToCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
    roleId: string,
  ): Promise<CasePartyLink>;

  unlinkPartyFromCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
    roleId: string,
  ): Promise<void>;

  listPartyRolesForCase(
    transaction: Prisma.TransactionClient,
    caseId: string,
    partyId: string,
  ): Promise<CasePartyLink[]>;
}
