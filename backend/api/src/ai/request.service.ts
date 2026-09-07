import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AiInvalidStateError, AiNotFoundError } from './ai.errors';
import {
  TASK_TYPES,
  type CreateAiRequestDto,
  type ValidatedRef,
} from './ai.dto';
import { RetrievalService, type RetrievalScope } from './retrieval.service';

@Injectable()
export class AiRequestService {
  constructor(private readonly retrieval: RetrievalService) {}

  async create(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
    access: RetrievalScope,
    dto: CreateAiRequestDto,
  ) {
    if (!TASK_TYPES.includes(dto.taskType as never)) {
      throw new AiInvalidStateError('Unknown task type');
    }
    await this.retrieval.resolveRefs(tx, tenantId, access, dto.refs);
    return tx.aiRequest.create({
      data: {
        tenantId,
        taskType: dto.taskType,
        refs: dto.refs as unknown as Prisma.InputJsonValue,
        promptHint: dto.promptHint,
        requestedBy: userId,
      },
    });
  }

  async list(
    tx: Prisma.TransactionClient,
    tenantId: string,
    access?: RetrievalScope,
  ) {
    const requests = await tx.aiRequest.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    if (!access || access.scope === 'FULL') return requests;
    const visible = [];
    for (const request of requests) {
      try {
        await this.retrieval.resolveRefs(
          tx,
          tenantId,
          access,
          request.refs as unknown as ValidatedRef[],
        );
        visible.push(request);
      } catch {
        continue;
      }
    }
    return visible;
  }

  async get(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
    access?: RetrievalScope,
  ) {
    const request = await tx.aiRequest.findFirst({
      where: { id, tenantId },
    });
    if (!request) throw new AiNotFoundError('AI request not found');
    if (access && access.scope === 'ASSIGNED') {
      try {
        await this.retrieval.resolveRefs(
          tx,
          tenantId,
          access,
          request.refs as unknown as ValidatedRef[],
        );
      } catch {
        throw new AiNotFoundError('AI request not found');
      }
    }
    return request;
  }
}
