import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../infrastructure/database/prisma.service';
import type { TemplateRenderer } from './interfaces/template-renderer.interface';
import { TemplateStatus, TemplateVersionStatus } from '@prisma/client';

@Injectable()
export class TemplateService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('TemplateRenderer')
    private readonly templateRenderer: TemplateRenderer,
  ) {}

  async createTemplate(tenantId: string, userId: string, data: any) {
    return this.prisma.template.create({
      data: {
        ...data,
        tenantId,
        createdBy: userId,
        updatedBy: userId,
        status: TemplateStatus.DRAFT,
      },
    });
  }

  async getTemplates(tenantId: string) {
    return this.prisma.template.findMany({ where: { tenantId } });
  }

  async getTemplateById(tenantId: string, templateId: string) {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, tenantId },
      include: { versions: true },
    });
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }
}
