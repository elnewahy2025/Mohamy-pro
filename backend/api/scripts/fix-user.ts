import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { randomUUID } from 'crypto';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  
  // Find the Demo Tenant
  const tenant = await prisma.tenant.findUnique({ where: { slug: 'demo-tenant' } });
  if (!tenant) {
    console.error('Demo tenant not found!');
    return;
  }

  const users = await prisma.user.findMany({
    where: { emailNormalized: 'testuser@example.com' }
  });

  for (const user of users) {
    console.log(`Fixing user: ${user.emailNormalized} (${user.id})`);

    const membership = await prisma.membership.upsert({
      where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
      update: { status: 'ACTIVE' },
      create: {
        id: randomUUID(),
        tenantId: tenant.id,
        userId: user.id,
        status: 'ACTIVE'
      }
    });

    await prisma.appSession.updateMany({
      where: { userId: user.id, status: 'ACTIVE' },
      data: {
        activeTenantId: tenant.id,
        activeMembershipId: membership.id,
        contextVersion: { increment: 1 }
      }
    });
  }

  console.log('Granted access to Demo Law Firm and updated sessions!');
  
  await app.close();
}
bootstrap().catch(console.error);
