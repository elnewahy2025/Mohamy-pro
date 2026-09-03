import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  Param,
} from '@nestjs/common';
import { Request } from 'express';
import { AppSessionGuard } from '../auth/app-session.guard';
import { CaseService } from './case.service';
import { CreateCaseDto, AddCasePartyDto } from './case.dto';

@Controller('cases')
@UseGuards(AppSessionGuard)
export class CaseController {
  constructor(private readonly caseService: CaseService) {}

  @Post()
  async createCase(@Req() req: Request, @Body() body: CreateCaseDto) {
    const ctx = (req as any).sessionContext;
    return this.caseService.createCase(ctx, body);
  }

  @Post(':id/parties')
  async addCaseParty(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AddCasePartyDto,
  ) {
    const ctx = (req as any).sessionContext;
    return this.caseService.addCaseParty(ctx, id, body);
  }
}
