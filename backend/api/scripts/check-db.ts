import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const prisma = app.get(PrismaService);
  
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  const sessions = await prisma.appSession.findMany({ orderBy: { createdAt: 'desc' } });
  const memberships = await prisma.membership.findMany({ orderBy: { createdAt: 'desc' } });
  
  console.log('--- RECENT USERS ---');
  console.dir(users.map(u => ({ id: u.id, email: u.emailNormalized })), { depth: null });
  console.log('--- ACTIVE SESSIONS ---');
  console.dir(sessions.map(s => ({ id: s.id, userId: s.userId, activeTenantId: s.activeTenantId, status: s.status })), { depth: null });
  console.log('--- MEMBERSHIPS ---');
  console.dir(memberships.map(m => ({ id: m.id, userId: m.userId, tenantId: m.tenantId, status: m.status })), { depth: null });
  
  await app.close();
}
bootstrap().catch(console.error);
