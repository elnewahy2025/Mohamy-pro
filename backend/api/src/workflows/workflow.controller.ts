import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionGuard } from '../auth/session/session.guard';
import { CsrfGuard } from '../auth/session/csrf.guard';
import { AUDIT_EVENT_TYPES } from '../audit/audit-constants';
import { WorkflowOperations } from './workflow.operations';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, CreateWorkflowVersionDto } from './workflow.dto';

@Controller({
  path: 'workflows',
  version: '1',
})
@UseGuards(SessionGuard, CsrfGuard)
export class WorkflowController {
  constructor(
    private readonly operations: WorkflowOperations,
    private readonly workflowService: WorkflowService,
  ) {}

  @Get()
  async listWorkflows(@Req() request: Request) {
    const ctx = await this.operations.authorize(request);
    return this.operations.read(request, ctx, async (tx) => {
      return this.workflowService.listWorkflows(tx, ctx.tenantId);
    });
  }

  @Post()
  async createWorkflow(
    @Req() request: Request,
    @Body() dto: CreateWorkflowDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WORKFLOW_CREATED,
      'Workflow',
      async (tx) => {
        return this.workflowService.createWorkflow(tx, ctx.tenantId, dto);
      },
      { name: dto.name, caseType: dto.caseType },
    );
  }

  @Post(':id/versions')
  async createVersion(
    @Req() request: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWorkflowVersionDto,
  ) {
    const ctx = await this.operations.authorize(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WORKFLOW_VERSION_CREATED,
      'WorkflowVersion',
      async (tx) => {
        return this.workflowService.createVersion(tx, ctx.tenantId, id, dto);
      },
      { workflowId: id },
    );
  }

  @Post('versions/:versionId/publish')
  async publishVersion(
    @Req() request: Request,
    @Param('versionId', ParseUUIDPipe) versionId: string,
  ) {
    const ctx = await this.operations.authorizePublish(request);
    return this.operations.run(
      request,
      ctx,
      AUDIT_EVENT_TYPES.WORKFLOW_VERSION_PUBLISHED,
      'WorkflowVersion',
      async (tx) => {
        return this.workflowService.publishVersion(tx, ctx.tenantId, versionId);
      },
      { versionId },
    );
  }
}
