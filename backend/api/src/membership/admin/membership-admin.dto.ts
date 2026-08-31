import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MembershipAdminDto {
  @IsUUID()
  membershipId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;

  @IsOptional()
  @IsDateString()
  activeUntil?: string;
}

export class MembershipReinstateDto {
  @IsUUID()
  membershipId!: string;

  @IsOptional()
  @IsDateString()
  activeFrom?: string;

  @IsOptional()
  @IsDateString()
  activeUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
