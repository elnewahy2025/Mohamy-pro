/**
 * Seeds the worked examples from docs/USER_MANUAL.md (Appendix A) into a
 * tenant so every page shows real data.
 *
 * Usage (from backend/api):
 *   TENANT_SLUG=mohamy node_modules/.bin/ts-node --transpile-only prisma/seed-manual-data.ts
 *
 * Notes:
 * - Aborts if the tenant already has cases (run once per tenant).
 * - Writes rows directly with the RLS tenant context set; no audit events
 *   are emitted for seeded rows.
 * - Users/memberships are NOT created (identities live in Keycloak): the
 *   script reuses the first ACTIVE membership as actor/assignee.
 */
import { randomUUID } from 'crypto';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';
dotenv.config();

const adapter = new PrismaPg(process.env.DATABASE_URL!, { schema: 'public' });
const prisma = new PrismaClient({ adapter });
const slug = process.env.TENANT_SLUG ?? 'mohamy';

async function ctx(
  tx: Prisma.TransactionClient,
  ids: { tenant: string; user: string; membership: string; op: string },
) {
  await tx.$executeRaw`SELECT set_config('app.tenant_id', ${ids.tenant}, true)`;
  await tx.$executeRaw`SELECT set_config('app.user_id', ${ids.user}, true)`;
  await tx.$executeRaw`SELECT set_config('app.membership_id', ${ids.membership}, true)`;
  await tx.$executeRaw`SELECT set_config('app.operation_id', ${ids.op}, true)`;
}

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant '${slug}' not found`);
  const existing = await prisma.case.count({ where: { tenantId: tenant.id } });
  if (existing > 0)
    throw new Error(`Tenant '${slug}' already has cases, aborting`);

  const membership = await prisma.membership.findFirst({
    where: { tenantId: tenant.id, status: 'ACTIVE' },
    select: { id: true, userId: true },
  });
  if (!membership) throw new Error('Tenant has no ACTIVE membership to act as');
  const ids = {
    tenant: tenant.id,
    user: membership.userId,
    membership: membership.id,
    op: randomUUID(),
  };
  const out: Record<string, string> = {};

  await prisma.$transaction(async (tx) => {
    await ctx(tx, ids);
    const T = tenant.id;

    const org = await tx.organization.create({
      data: { tenantId: T, slug: 'riyadh-hq', name: 'Riyadh HQ' },
    });
    const branch = await tx.branch.create({
      data: {
        tenantId: T,
        organizationId: org.id,
        slug: 'jeddah-branch',
        name: 'Jeddah Branch',
      },
    });
    await tx.department.create({
      data: {
        tenantId: T,
        branchId: branch.id,
        slug: 'litigation',
        name: 'Litigation',
      },
    });
    await tx.team.create({
      data: {
        tenantId: T,
        slug: 'appeals-squad',
        name: 'Appeals Squad',
        description: 'Appeals team',
      },
    });
    await tx.organizationSetting.create({
      data: {
        tenantId: T,
        key: 'working.days',
        value: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
        updatedByMembershipId: membership.id,
      },
    });

    const country =
      (await tx.country.findFirst({ where: { code: 'SA' } })) ??
      (await tx.country.create({ data: { code: 'SA', name: 'Saudi Arabia' } }));
    const jurisdiction = await tx.jurisdiction.create({
      data: { tenantId: T, countryId: country.id, name: 'Riyadh General' },
    });
    const court = await tx.court.create({
      data: {
        tenantId: T,
        jurisdictionId: jurisdiction.id,
        name: 'Commercial Court Riyadh',
        courtType: 'COMMERCIAL',
        department: 'Third Circuit',
      },
    });
    await tx.courtLocation.create({
      data: {
        tenantId: T,
        courtId: court.id,
        name: 'Main Building',
        city: 'Riyadh',
        address: 'King Fahd Rd',
      },
    });

    const client = await tx.client.create({
      data: {
        tenantId: T,
        clientType: 'ORGANIZATION',
        name: 'Al Noor Trading Co.',
        legalName: 'Al Noor Trading Company LLC',
        displayName: 'Al Noor Trading Co.',
        source: 'referral',
        notes: 'VIP',
      },
    });
    out.client = client.id;
    await tx.clientContact.create({
      data: {
        tenantId: T,
        clientId: client.id,
        type: 'MOBILE',
        value: '+966501234567',
        label: 'Office',
        isPrimary: true,
      },
    });
    await tx.clientAddress.create({
      data: {
        tenantId: T,
        clientId: client.id,
        type: 'REGISTERED',
        line1: 'King Fahd Rd, Tower A, Floor 12',
        city: 'Riyadh',
        country: 'SA',
        postalCode: '12213',
        isPrimary: true,
      },
    });

    const partyA = await tx.party.create({
      data: {
        tenantId: T,
        partyType: 'ORGANIZATION',
        displayName: 'Al Noor Trading',
        clientId: client.id,
      },
    });
    const partyB = await tx.party.create({
      data: {
        tenantId: T,
        partyType: 'ORGANIZATION',
        displayName: 'Al Noor Subsidiary',
      },
    });
    await tx.partyRelationship.create({
      data: {
        tenantId: T,
        fromPartyId: partyB.id,
        toPartyId: partyA.id,
        relationshipType: 'subsidiary of',
      },
    });

    // const check = await tx.conflictCheck.create({
    //   data: {
    //     tenantId: T,
    //     requesterUserId: membership.userId,
    //     clientId: client.id,
    //   },
    // });
    // await tx.conflictParty.create({
    //   data: {
    //     tenantId: T,
    //     conflictCheckId: check.id,
    //     kind: 'PARTY',
    //     name: 'Al Noor Trading',
    //     normalizedName: 'al noor trading',
    //     email: 'legal@alnoor.example.com',
    //   },
    // });

    const prospect = await tx.client.create({
      data: {
        tenantId: T,
        clientType: 'INDIVIDUAL',
        name: 'Layla Haddad',
        displayName: 'Layla Haddad',
        source: 'INTAKE',
        notes:
          'Contractor failed to deliver the villa by March; claiming delay penalties.',
      },
    });
    await tx.intakeRequest.create({
      data: {
        tenantId: T,
        fullName: 'Layla Haddad',
        clientType: 'INDIVIDUAL',
        matterSummary:
          'Contractor failed to deliver the villa by March; claiming delay penalties.',
        status: 'APPROVED',
        reviewerMembershipId: membership.id,
        createdClientId: prospect.id,
        createdBy: membership.userId,
      },
    });
    await tx.intakeRequest.create({
      data: {
        tenantId: T,
        fullName: 'Omar Farouk',
        clientType: 'INDIVIDUAL',
        matterSummary: 'Employment termination dispute.',
        status: 'NEW',
        createdBy: membership.userId,
      },
    });

    const role = await tx.partyRole.create({
      data: { tenantId: T, key: 'claimant', label: 'Claimant' },
    });
    const kase = await tx.case.create({
      data: {
        tenantId: T,
        caseNumber: 'C-2026-0143',
        clientId: client.id,
        internalNumber: 'INT-9921',
        practiceArea: 'Commercial',
        caseType: 'COMMERCIAL',
        status: 'OPEN',
        priority: 'HIGH',
        openDate: new Date('2026-09-01'),
      },
    });
    out.case = kase.id;
    await tx.caseParty.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        partyId: partyA.id,
        roleId: role.id,
      },
    });
    await tx.caseTimelineEvent.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        eventType: 'NOTE_ADDED',
        actorUserId: membership.userId,
        actorMembershipId: membership.id,
        payload: { note: 'Client confirmed hearing date' },
      },
    });
    await tx.caseAssignment.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        membershipId: membership.id,
        createdByMembershipId: membership.id,
      },
    });

    const hearing = await tx.hearing.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        courtId: court.id,
        date: new Date('2026-10-05T09:30:00Z'),
        time: '09:30',
        hearingType: 'First hearing',
        notes: 'Bring original contracts',
      },
    });
    out.hearing = hearing.id;
    const rule = await tx.deadlineRule.create({
      data: {
        tenantId: T,
        name: 'Appeal 30 days',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: new Date('2026-12-31'),
      },
    });
    const deadline = await tx.deadline.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        title: 'Submit statement of claim',
        description: '30-page limit',
        deadlineType: 'FIXED',
        dueDate: new Date('2026-09-30'),
        ruleId: rule.id,
      },
    });
    out.deadline = deadline.id;
    const task = await tx.task.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        title: 'Translate exhibit B',
        description: 'Certified translation, 12 pages',
        priority: 'HIGH',
        dueDate: new Date('2026-09-20'),
      },
    });
    out.task = task.id;
    const document = await tx.document.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        clientId: client.id,
        title: 'Exhibit B — signed contract',
        description: 'Arabic original + translation',
        documentType: 'CONTRACT',
        uploadedById: membership.id,
      },
    });
    out.document = document.id;

    await tx.fee.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        clientId: client.id,
        kind: 'HOURLY',
        description: 'Hearing attendance 2h',
        amount: '1500',
        currency: 'EGP',
      },
    });
    await tx.expense.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        description: 'Court fees',
        amount: '350',
        currency: 'EGP',
      },
    });
    const tax = await tx.taxRule.create({
      data: { tenantId: T, name: 'VAT 15%', rate: '15' },
    });
    const invoice = await tx.invoice.create({
      data: {
        tenantId: T,
        caseId: kase.id,
        clientId: client.id,
        invoiceNumber: 'INV-2026-0087',
        status: 'ISSUED',
        currency: 'EGP',
        subtotal: '1500',
        discountAmount: '0',
        taxAmount: '225',
        total: '1725',
        taxRuleId: tax.id,
        taxRateSnapshot: '15',
        dueDate: new Date('2026-10-15'),
        issuedAt: new Date('2026-09-07'),
      },
    });
    out.invoice = invoice.id;
    await tx.payment.create({
      data: {
        tenantId: T,
        invoiceId: invoice.id,
        amount: '1725',
        currency: 'EGP',
        status: 'SUCCEEDED',
        idempotencyKey: 'pay-2026-0087-attempt-1',
      },
    });

    await tx.notification.create({
      data: {
        tenantId: T,
        membershipId: membership.id,
        title: 'Hearing scheduled',
        body: 'C-2026-0143 hearing on Oct 5 at 09:30.',
        channel: 'IN_APP',
        status: 'SENT',
        relatedType: 'Hearing',
        relatedId: hearing.id,
        sentAt: new Date(),
      },
    });
    await tx.reportDefinition.create({
      data: {
        tenantId: T,
        name: 'Open cases by status',
        dataSource: 'CASE',
        columns: ['caseNumber', 'status', 'priority'],
        createdBy: membership.userId,
      },
    });
    await tx.retentionPolicy.create({
      data: {
        tenantId: T,
        targetType: 'AUDIT_EVENT',
        retainYears: 7,
        enabled: true,
        createdBy: membership.userId,
      },
    });
    await tx.backupPolicy.create({
      data: {
        tenantId: T,
        rpoHours: 24,
        rtoHours: 4,
        scheduleCron: '0 2 * * *',
        retentionDays: 90,
        enabled: true,
        createdBy: membership.userId,
      },
    });
    await tx.restoreDrill.create({
      data: {
        tenantId: T,
        name: 'Q3 restore drill',
        targetRef: 'restore-branch-2026-q3',
        status: 'PASSED',
        checks: [
          {
            name: 'restore',
            passed: true,
            evidence: 'Branch verified, 44 migrations applied',
          },
        ],
        startedBy: membership.userId,
        finishedBy: membership.id,
        finishedAt: new Date(),
      },
    });
    await tx.aiRequest.create({
      data: {
        tenantId: T,
        taskType: 'CASE_BRIEF',
        refs: [{ kind: 'CASE', id: kase.id }],
        promptHint: 'Focus on upcoming deadlines',
        requestedBy: membership.userId,
      },
    });
  }, { maxWait: 20000, timeout: 60000 });

  console.log(JSON.stringify({ tenant: slug, ...out }, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
