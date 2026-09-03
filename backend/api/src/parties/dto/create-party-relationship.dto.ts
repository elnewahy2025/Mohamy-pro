import { IsString, IsUUID, MaxLength } from 'class-validator';

export class CreatePartyRelationshipDto {
  @IsUUID(4)
  toPartyId!: string;

  @IsString()
  @MaxLength(255)
  relationshipType!: string;
}
