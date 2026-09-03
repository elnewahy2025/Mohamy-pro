import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

export interface MatchPartyInput {
  name: string;
  email?: string | null;
}

export interface ConflictMatchResult {
  partyName: string;
  normalized: string;
  matchedClientIds: string[];
  reasons: string[];
}

/**
 * Deterministic conflict match: normalizes prospective party name/email inputs
 * and scans the active tenant's Client (displayName) and ClientContact (value)
 * rows for equality/substring collisions. NOT a full-text search engine — the
 * Search engine arrives in Phase 19, so this only ever produces *flags* for a
 * reviewer's decision, never an authoritative conflict determination.
 */
@Injectable()
export class ConflictMatchService {
  normalize(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Runs inside the caller's tenant transaction (RLS active). Returns, per
   * party, the matched Client ids and the human-readable reasons — never the
   * matched contact values themselves (they may be PII).
   */
  async match(
    transaction: Prisma.TransactionClient,
    tenantId: string,
    parties: MatchPartyInput[],
  ): Promise<ConflictMatchResult[]> {
    const normalizedByParty = parties.map((p) => ({
      ...p,
      normalized: this.normalize(p.name),
      emailNormalized: p.email ? this.normalize(p.email) : null,
    }));

    const nameTerms = normalizedByParty.map((p) => p.normalized);
    const emailTerms = normalizedByParty
      .filter((p) => p.emailNormalized)
      .map((p) => p.emailNormalized as string);

    // Match client display names by normalized-equality or containment either
    // direction (a prospective party that shares a client name).
    const nameClients: { id: string; displayName: string }[] = [];
    if (nameTerms.length > 0) {
      nameClients.push(
        ...(await transaction.client.findMany({
          where: {
            tenantId,
            OR: nameTerms.map((term) => ({
              displayName: { contains: term, mode: 'insensitive' },
            })),
          },
          select: { id: true, displayName: true },
        })),
      );
    }

    // Match contact values (phone/email) by normalized-equality against the
    // party's supplied email; a contact email equalling a prospective party
    // email is a strong flag.
    const emailClients: { id: string; displayName: string }[] = [];
    if (emailTerms.length > 0) {
      const contactRows = await transaction.clientContact.findMany({
        where: {
          tenantId,
          type: 'EMAIL',
          OR: emailTerms.map((term) => ({ value: term })),
        },
        select: { clientId: true },
      });
      if (contactRows.length > 0) {
        emailClients.push(
          ...(await transaction.client.findMany({
            where: {
              tenantId,
              id: { in: [...new Set(contactRows.map((c) => c.clientId))] },
            },
            select: { id: true, displayName: true },
          })),
        );
      }
    }

    const clientById = new Map<string, string>();
    for (const c of [...nameClients, ...emailClients]) {
      clientById.set(c.id, c.displayName);
    }

    return normalizedByParty.map((p) => {
      const reasons: string[] = [];
      const matchedClientIds: string[] = [];
      for (const c of nameClients) {
        if (c.displayName.toLowerCase().includes(p.normalized)) {
          matchedClientIds.push(c.id);
          reasons.push(`Client name matches prospective party "${p.name}"`);
          break;
        }
      }
      if (p.emailNormalized) {
        for (const c of emailClients) {
          if (!matchedClientIds.includes(c.id)) {
            matchedClientIds.push(c.id);
          }
        }
        if (emailClients.length > 0) {
          reasons.push(`Client contact email matches prospective party email`);
        }
      }
      return {
        partyName: p.name,
        normalized: p.normalized,
        matchedClientIds,
        reasons,
      };
    });
  }
}
