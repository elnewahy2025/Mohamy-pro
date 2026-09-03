import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TaskNotFoundError, TaskInvalidStateError } from './task.errors';
import type {
  CreateTaskDto,
  UpdateTaskStatusDto,
  AssignTaskDto,
} from './task.dto';

@Injectable()
export class TaskService {
  private readonly logger = new Logger(TaskService.name);

  async createTask(
    tx: Prisma.TransactionClient,
    tenantId: string,
    reporterUserId: string,
    dto: CreateTaskDto,
  ) {
    return tx.task.create({
      data: {
        tenantId,
        caseId: dto.caseId,
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'MEDIUM',
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        assignedUserId: dto.assignedUserId,
        reporterUserId,
        parentTaskId: dto.parentTaskId,
        recurringRule: dto.recurringRule ?? Prisma.DbNull,
        sla: dto.sla ?? Prisma.DbNull,
        escalationRule: dto.escalationRule ?? Prisma.DbNull,
      },
    });
  }

  async listTasks(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId?: string,
    assignedUserId?: string,
  ) {
    return tx.task.findMany({
      where: {
        tenantId,
        ...(caseId ? { caseId } : {}),
        ...(assignedUserId ? { assignedUserId } : {}),
      },
      include: {
        assignedUser: true,
        checklists: true,
        dependencies: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async updateTaskStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    taskId: string,
    dto: UpdateTaskStatusDto,
  ) {
    const task = await tx.task.findUnique({
      where: { id: taskId, tenantId },
      include: { dependsOn: true },
    });

    if (!task) throw new TaskNotFoundError('Task not found');
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new TaskInvalidStateError('Task is already completed or cancelled');
    }

    if (dto.status === 'COMPLETED') {
      // Basic block check: Ensure no prerequisite tasks are incomplete
      const incompletePrereqs = await tx.task.count({
        where: {
          id: { in: task.dependsOn.map((d) => d.prerequisiteTaskId) },
          status: { notIn: ['COMPLETED', 'CANCELLED'] },
        },
      });

      if (incompletePrereqs > 0) {
        throw new TaskInvalidStateError(
          'Cannot complete task with incomplete prerequisites',
        );
      }
    }

    return tx.task.update({
      where: { id: taskId },
      data: {
        status: dto.status,
      },
    });
  }

  async assignTask(
    tx: Prisma.TransactionClient,
    tenantId: string,
    taskId: string,
    dto: AssignTaskDto,
  ) {
    const task = await tx.task.findUnique({
      where: { id: taskId, tenantId },
    });

    if (!task) throw new TaskNotFoundError('Task not found');

    return tx.task.update({
      where: { id: taskId },
      data: {
        assignedUserId: dto.assignedUserId,
      },
    });
  }
}
