import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ActivateBreakGlassDto {
  @IsUUID(4)
  subjectMembershipId!: string;

  @IsUUID(4)
  caseId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;

  @IsDateString()
  @IsOptional()
  endsAt?: string;
}
