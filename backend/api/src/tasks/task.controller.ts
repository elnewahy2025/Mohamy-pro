import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { TaskOperations } from './task.operations';
import { TaskService } from './task.service';
import { CreateTaskDto, UpdateTaskStatusDto, AssignTaskDto } from './task.dto';

@Controller({
  path: 'tasks',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class TaskController {
  constructor(
    private readonly operations: TaskOperations,
    private readonly taskService: TaskService,
  ) {}

  @Get()
  async listTasks(
    @Req() request: Request,
    @Query('caseId') caseId?: string,
    @Query('assignedUserId') assignedUserId?: string,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.taskService.listTasks(
        tx,
        ctx.tenantId,
        caseId,
        assignedUserId,
      );
    });
  }

  @Post()
  async createTask(@Req() request: Request, @Body() dto: CreateTaskDto) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TASK_CREATED,
      'Task',
      async (tx) => {
        return this.taskService.createTask(
          tx,
          ctx.tenantId,
          ctx.actorMembershipId,
          dto,
        );
      },
      { caseId: dto.caseId, priority: dto.priority, dueDate: dto.dueDate },
    );
  }

  @Patch(':id/status')
  async updateStatus(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskStatusDto,
  ) {
    const ctx = await this.operations.authorize(request);
    const eventType =
      dto.status === 'COMPLETED'
        ? AUDIT_EVENT_TYPES.TASK_COMPLETED
        : AUDIT_EVENT_TYPES.TASK_UPDATED;

    return this.operations.run(
      request,
      ctx,
      eventType,
      'Task',
      async (tx) => {
        return this.taskService.updateTaskStatus(tx, ctx.tenantId, id, dto);
      },
      { status: dto.status },
    );
  }

  @Patch(':id/assign')
  async assignTask(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignTaskDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.TASK_ASSIGNED,
      'Task',
      async (tx) => {
        return this.taskService.assignTask(tx, ctx.tenantId, id, dto);
      },
      { assignedUserId: dto.assignedUserId },
    );
  }
}
