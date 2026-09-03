import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

export interface GateProspectiveParty {
  name: string;
  email?: string | null;
}

export interface GateVerdict {
  cleared: boolean;
  blocks: {
    partyName: string;
    decision: 'BLOCK';
    reason: string | null;
    conflictCheckId: string;
  }[];
  reasons: string[];
}

/**
 * La acceptance-gate decision contract. A Matter/Case acceptance flow (Phase
 * 7/8) MUST invoke `assertClearForCase` before accepting a new matter/case; a
 * verdict of `cleared: false` blocks acceptance. Conservative posture: any
 * COMPLETED conflict check whose final decision is BLOCK — where the check's
 * normalized party names collide with a prospective party — yields a
 * not-clear verdict. This is the durable surface the phased gate wiring hangs
 * off; the call site itself is delivered in Phase 7/8 (recorded not silent).
 */
@Injectable()
export class ConflictGateService {
  normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Runs inside the caller's tenant transaction (RLS active). No
   * CanManageConflictChecks permission is asserted here — this is a read-only,
   * non-enumerating check consumed by an acceptance flow, not by a conflict
   * reviewer. Cross-tenant leakage is prevented by RLS (tenantId always set
   * from the session context).
   */
  async assertClearForCase(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    prospectiveParties: GateProspectiveParty[],
  ): Promise<GateVerdict> {
    const terms = prospectiveParties.map((p) => ({
      ...p,
      normalized: this.normalize(p.name),
    }));

    if (terms.length === 0) {
      return {
        cleared: true,
        blocks: [],
        reasons: ['No prospective parties provided.'],
      };
    }

    // Find completed checks with a BLOCK decision in this tenant that reference
    // at least one prospective party by normalized name.
    const blockedChecks = await transaction.conflictCheck.findMany({
      where: {
        tenantId,
        status: 'COMPLETED',
        decision: 'BLOCK',
      },
      select: { id: true, reason: true },
    });

    const blocks: GateVerdict['blocks'] = [];
    for (const check of blockedChecks) {
      const parties = await transaction.conflictParty.findMany({
        where: {
          conflictCheckId: check.id,
          tenantId,
          OR: terms.map((t) => ({ normalizedName: t.normalized })),
        },
        select: { name: true },
      });
      for (const party of parties) {
        const prospective = terms.find(
          (t) => t.normalized === this.normalize(party.name),
        );
        blocks.push({
          partyName: prospective?.name ?? party.name,
          decision: 'BLOCK',
          reason: check.reason,
          conflictCheckId: check.id,
        });
      }
    }

    if (blocks.length > 0) {
      return {
        cleared: false,
        blocks,
        reasons: [
          `One or more prospective parties is blocked by a completed conflict check.`,
        ],
      };
    }

    return {
      cleared: true,
      blocks: [],
      reasons: [
        `No completed BLOCK conflict check matches any prospective party.`,
      ],
    };
  }
}
