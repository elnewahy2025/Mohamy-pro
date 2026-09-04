import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { randomUUID } from 'crypto';
import { ClientType, ConflictCheckStatus, ConflictDecision, ConflictPartyType } from '@prisma/client';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  
  console.log('Seeding demo data...');
  
  let tenantId: any = randomUUID();
  let userId: any = randomUUID();
  let membershipId: any = randomUUID();

  // 1. Create or find Tenant, User, and Membership via delivery scope
  await prisma.withDeliveryScope(async (tx) => {
    const tenant = await tx.tenant.upsert({
      where: { slug: 'demo-tenant' },
      update: {},
      create: {
        id: tenantId,
        slug: 'demo-tenant',
        name: 'Demo Law Firm',
        status: 'ACTIVE'
      }
    });
    // Override generated tenantId with existing one if it exists
    tenantId = tenant.id;

    const user = await tx.user.upsert({
      where: { emailNormalized: 'demo@mohamy.com' },
      update: {},
      create: {
        id: userId,
        status: 'ACTIVE',
        emailNormalized: 'demo@mohamy.com',
        displayName: 'Demo User'
      }
    });
    userId = user.id;

    const membership = await tx.membership.upsert({
      where: { userId_tenantId: { userId, tenantId } },
      update: {},
      create: {
        id: membershipId,
        tenantId,
        userId,
        status: 'ACTIVE'
      }
    });
    membershipId = membership.id;
  });

  console.log(`Created Tenant (ID: ${tenantId}) and User (ID: ${userId})`);

  // 2. Seed tenant data using withTenantContext
  await prisma.withTenantContext({ tenantId, userId, membershipId, operationId: randomUUID() }, async (tx) => {
    
    // Check if data already exists
    const existing = await tx.organization.findFirst({ where: { slug: 'hq' } });
    if (existing) {
      console.log('Demo data already exists, skipping seed.');
      return;
    }

    // Organization Config
    const orgId = randomUUID();
    await tx.organization.create({
      data: { id: orgId, tenantId, slug: 'hq', name: 'Headquarters' }
    });

    const branchId = randomUUID();
    await tx.branch.create({
      data: { id: branchId, tenantId, organizationId: orgId, slug: 'riyadh', name: 'Riyadh Branch' }
    });

    const deptId = randomUUID();
    await tx.department.create({
      data: { id: deptId, tenantId, branchId, slug: 'litigation', name: 'Litigation Department' }
    });

    const teamId = randomUUID();
    await tx.team.create({
      data: { id: teamId, tenantId, slug: 'civil-litigation', name: 'Civil Litigation Team' }
    });

    console.log('Seeded Organization Config');

    // Clients
    const client1Id = randomUUID();
    await tx.client.create({
      data: { id: client1Id, tenantId, clientType: ClientType.ORGANIZATION, name: 'Acme Corp', displayName: 'Acme Corp' }
    });
    
    const client2Id = randomUUID();
    await tx.client.create({
      data: { id: client2Id, tenantId, clientType: ClientType.INDIVIDUAL, name: 'John Doe', displayName: 'John Doe' }
    });

    console.log('Seeded Clients');

    // Conflict Checks
    await tx.conflictCheck.create({
      data: {
        tenantId,
        requesterUserId: userId,
        clientId: client1Id,
        status: ConflictCheckStatus.COMPLETED,
        decision: ConflictDecision.ALLOW,
        reason: 'No conflicts found.',
        reviewerUserId: userId,
        parties: {
          create: [
            { tenantId, kind: ConflictPartyType.PARTY, name: 'Acme Corp', normalizedName: 'acme corp' },
            { tenantId, kind: ConflictPartyType.RELATED_ENTITY, name: 'Globex', normalizedName: 'globex' }
          ]
        }
      }
    });

    await tx.conflictCheck.create({
      data: {
        tenantId,
        requesterUserId: userId,
        status: ConflictCheckStatus.PENDING,
        parties: {
          create: [
            { tenantId, kind: ConflictPartyType.PARTY, name: 'Jane Smith', normalizedName: 'jane smith' }
          ]
        }
      }
    });

    console.log('Seeded Conflict Checks');
  });

  console.log('Seeding complete! Data successfully loaded.');
  
  await app.close();
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
