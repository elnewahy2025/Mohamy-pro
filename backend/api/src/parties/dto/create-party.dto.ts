import {
  IsEnum,
  IsString,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PartyType } from '@prisma/client';

export class CreatePartyDto {
  @IsEnum(PartyType)
  partyType!: PartyType;

  @ValidateIf((o) => o.partyType === 'PERSON')
  @IsString()
  @MaxLength(255)
  name?: string;

  @ValidateIf((o) => o.partyType === 'ORGANIZATION')
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsString()
  @MaxLength(255)
  displayName!: string;

  @IsOptional()
  @IsUUID(4)
  clientId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
