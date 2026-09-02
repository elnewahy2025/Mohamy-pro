import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const adapter = new PrismaPg(process.env.DATABASE_URL!, { schema: 'public' });
const prisma = new PrismaClient({ adapter });

async function run() {
  console.log('--- W8 Round-Trip Verification Script ---');

  // 1. Setup a fake session for the operator
  const userId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const csrfToken = crypto.randomBytes(32).toString('hex');
  
  console.log(`[1] Creating test user and session for Operator...`);
  
  await prisma.user.create({
    data: {
      id: userId,
      status: 'PENDING',
      emailNormalized: 'operator@mohamy.pro',
    }
  });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const csrfTokenHash = crypto.createHash('sha256').update(csrfToken).digest('hex');

  await prisma.appSession.create({
    data: {
      id: sessionId,
      userId: userId,
      status: 'ACTIVE',
      tokenHash,
      csrfTokenHash,
      provider: 'keycloak',
      providerSubject: 'runtime-verify-operator-subject',
      mfaVerifiedAt: new Date(),
      absoluteExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
      idleExpiresAt: new Date(Date.now() + 1000 * 60 * 60),
    }
  });

  // The application uses raw opaque tokens in the cookie, NOT Express signed cookies.
  const signedSession = token;
  
  const headers = {
    'Cookie': `mohamy_session=${encodeURIComponent(signedSession)}; mohamy_csrf=${csrfToken}`,
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
    'Origin': 'http://localhost:5173',
    'Idempotency-Key': crypto.randomUUID()
  };

  const API_URL = 'http://localhost:3000/api/v1';

  // --------------------------------------------------------------------------
  // Round Trip 1: Bootstrap
  // --------------------------------------------------------------------------
  console.log(`\n[2] Executing Round Trip 1: Bootstrap`);
  const bootstrapRes = await fetch(`${API_URL}/bootstrap`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      secret: '6b1f8c4e2a9d3f7b0c5e8a1d4f2a6b8c9e3d5f7a1b9c4e2a6d8f0b3c5e7a9d1f3b5'
    })
  });
  console.log('Bootstrap Status:', bootstrapRes.status);
  const bootstrapBody = await bootstrapRes.text();
  console.log('Bootstrap Response:', bootstrapBody);

  // --------------------------------------------------------------------------
  // Round Trip 2: Tenant Switch
  // --------------------------------------------------------------------------
  console.log(`\n[3] Executing Round Trip 2: Tenant Switch (Assuming bootstrap worked and assigned a tenant)`);
  // Fetch user's tenant membership
  const memberships = await prisma.membership.findMany({ where: { userId } });
  if (memberships.length === 0) {
    console.error('No memberships found for user! Bootstrap may have failed.');
  } else {
    const tenantId = memberships[0].tenantId;
    
    const switchRes = await fetch(`${API_URL}/session/tenant-switch`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ tenantId })
    });
    console.log('Tenant Switch Status:', switchRes.status);
    const switchBody = await switchRes.text();
    console.log('Tenant Switch Response:', switchBody);
    
    // --------------------------------------------------------------------------
    // Round Trip 3: Invitation
    // --------------------------------------------------------------------------
    console.log(`\n[4] Executing Round Trip 3: Invitation`);
    const invRes = await fetch(`${API_URL}/membership/invitations`, {
      method: 'POST',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID(), 'x-tenant-id': tenantId },
      body: JSON.stringify({
        intendedEmail: 'newuser@mohamy.pro',
        requestedRoleKeys: ['tenant.admin']
      })
    });
    console.log('Invitation Status:', invRes.status);
    const invBody = await invRes.text();
    console.log('Invitation Response:', invBody);

    // --------------------------------------------------------------------------
    // Round Trip 4: Membership Admin
    // --------------------------------------------------------------------------
    console.log(`\n[5] Executing Round Trip 4: Membership Admin (Suspend)`);
    const adminRes = await fetch(`${API_URL}/membership/members/suspend`, {
      method: 'PATCH',
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID(), 'x-tenant-id': tenantId },
      body: JSON.stringify({
        membershipId: memberships[0].id,
        reason: 'W8 Verification Suspend'
      })
    });
    console.log('Membership Admin Status:', adminRes.status);
    const adminBody = await adminRes.text();
    console.log('Membership Admin Response:', adminBody);
  }

  // Cleanup
  console.log(`\n[6] Cleaning up test data...`);
  await prisma.appSession.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
  console.log('Cleanup complete.');
}

run().catch(console.error).finally(() => prisma.$disconnect());
