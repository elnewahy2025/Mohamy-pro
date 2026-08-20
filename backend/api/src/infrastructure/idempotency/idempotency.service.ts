import { Injectable } from '@nestjs/common';
import { Prisma, type IdempotencyKey } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export interface RegisterIdempotencyInput {
  key: string;
  userId?: string;
  tenantId?: string;
  requestPath: string;
  responseStatus: number;
  responseBody: Prisma.InputJsonValue;
  expiresAt: Date;
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async findValid(key: string): Promise<IdempotencyKey | null> {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (!record) {
      return null;
    }
    if (record.expiresAt <= new Date()) {
      await this.prisma.idempotencyKey.delete({ where: { key } });
      return null;
    }
    return record;
  }

  async register(input: RegisterIdempotencyInput): Promise<IdempotencyKey> {
    try {
      return await this.prisma.idempotencyKey.create({
        data: {
          key: input.key,
          userId: input.userId,
          tenantId: input.tenantId,
          requestPath: input.requestPath,
          responseStatus: input.responseStatus,
          responseBody: input.responseBody,
          expiresAt: input.expiresAt,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const existing = await this.findValid(input.key);
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lte: now } },
    });
    return result.count;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
