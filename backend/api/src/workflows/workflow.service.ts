import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  WorkflowNotFoundError,
  WorkflowInvalidStateError,
} from './workflow.errors';
import type {
  CreateWorkflowDto,
  CreateWorkflowVersionDto,
} from './workflow.dto';

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  async createWorkflow(
    tx: Prisma.TransactionClient,
    tenantId: string,
    dto: CreateWorkflowDto,
  ) {
    return tx.workflow.create({
      data: {
        tenantId,
        name: dto.name,
        caseType: dto.caseType,
      },
    });
  }

  async listWorkflows(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.workflow.findMany({
      where: { tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
  }

  async createVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    workflowId: string,
    dto: CreateWorkflowVersionDto,
  ) {
    const workflow = await tx.workflow.findFirst({
      where: { id: workflowId, tenantId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });

    if (!workflow) throw new WorkflowNotFoundError('Workflow not found');

    const nextVersion =
      workflow.versions.length > 0 ? workflow.versions[0].version + 1 : 1;

    const initialStates = dto.states.filter((s) => s.isInitial);
    if (initialStates.length !== 1) {
      throw new WorkflowInvalidStateError(
        'A workflow version must define exactly one initial state',
      );
    }

    const createdStates = await tx.workflowVersion.create({
      data: {
        tenantId,
        workflowId,
        version: nextVersion,
        status: 'DRAFT',
        states: {
          create: dto.states.map((s) => ({
            tenantId,
            name: s.name,
            isInitial: s.isInitial ?? false,
            isFinal: s.isFinal ?? false,
          })),
        },
      },
      include: {
        states: true,
      },
    });

    const stateByKey = new Map(
      createdStates.states.map((state) => [state.name, state.id]),
    );

    const transitions = dto.transitions.map((t) => {
      const toStateId = stateByKey.get(t.toStateName);
      if (!toStateId) {
        throw new WorkflowInvalidStateError(
          `Transition references unknown state "${t.toStateName}"`,
        );
      }
      const fromStateId = t.fromStateName
        ? (stateByKey.get(t.fromStateName) ?? null)
        : null;
      if (t.fromStateName && !fromStateId) {
        throw new WorkflowInvalidStateError(
          `Transition references unknown state "${t.fromStateName}"`,
        );
      }
      return {
        tenantId,
        versionId: createdStates.id,
        fromStateId,
        toStateId,
        conditions: t.conditions ?? Prisma.JsonNull,
        actions: t.actions ?? Prisma.JsonNull,
        requiresApproval: t.requiresApproval ?? false,
      };
    });

    await tx.workflowTransition.createMany({
      data: transitions,
    });

    const versionWithGraph = await tx.workflowVersion.findUnique({
      where: { id: createdStates.id },
      include: {
        states: true,
        transitions: true,
      },
    });
    if (!versionWithGraph)
      throw new WorkflowNotFoundError('Workflow version not found');

    return versionWithGraph;
  }

  async publishVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    versionId: string,
  ) {
    const version = await tx.workflowVersion.findFirst({
      where: { id: versionId, tenantId },
      include: {
        workflow: true,
      },
    });

    if (!version) throw new WorkflowNotFoundError('Workflow version not found');
    if (version.status !== 'DRAFT')
      throw new WorkflowInvalidStateError(
        'Only draft versions can be published',
      );

    // Retire currently published versions
    await tx.workflowVersion.updateMany({
      where: {
        tenantId,
        workflowId: version.workflowId,
        status: 'PUBLISHED',
      },
      data: {
        status: 'RETIRED',
        effectiveTo: new Date(),
      },
    });

    return tx.workflowVersion.update({
      where: { id: versionId },
      data: {
        status: 'PUBLISHED',
        effectiveFrom: new Date(),
      },
    });
  }
}
