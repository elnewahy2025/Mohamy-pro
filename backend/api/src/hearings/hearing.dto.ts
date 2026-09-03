import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsUUID,
} from 'class-validator';

export class CreateHearingDto {
  @IsUUID()
  @IsNotEmpty()
  caseId: string;

  @IsUUID()
  @IsOptional()
  courtId?: string;

  @IsUUID()
  @IsOptional()
  courtLocationId?: string;

  @IsUUID()
  @IsOptional()
  assignedLawyerId?: string;

  @IsDateString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsOptional()
  time?: string;

  @IsString()
  @IsOptional()
  hearingType?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsUUID()
  @IsOptional()
  nextHearingId?: string;
}

export class UpdateHearingOutcomeDto {
  @IsString()
  @IsOptional()
  outcome?: string;

  @IsString()
  @IsNotEmpty()
  status: 'SCHEDULED' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED';
}
