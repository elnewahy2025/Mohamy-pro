import { Controller, Post, Get, Body, Param, Req } from '@nestjs/common';
import { TemplateService } from './template.service';

@Controller('v1/templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Post()
  async createTemplate(@Body() data: any, @Req() req: any) {
    // Requires CanManageTemplates permission
    return this.templateService.createTemplate(
      req.tenantId,
      req.user?.id || 'system',
      data,
    );
  }

  @Get()
  async listTemplates(@Req() req: any) {
    return this.templateService.getTemplates(req.tenantId);
  }

  @Get(':id')
  async getTemplate(@Param('id') id: string, @Req() req: any) {
    return this.templateService.getTemplateById(req.tenantId, id);
  }
}
