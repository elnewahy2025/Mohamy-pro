import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PartyType, HierarchyStatus } from '@prisma/client';
import { PaginationDto } from '../../common/api/pagination.dto';

export class PartyQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(PartyType)
  partyType?: PartyType;

  @IsOptional()
  @IsEnum(HierarchyStatus)
  status?: HierarchyStatus;
}
