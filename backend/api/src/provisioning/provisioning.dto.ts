import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ProvisionUserDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @IsOptional()
  @Matches(/^[a-zA-Z0-9._-]{3,64}$/)
  @MaxLength(64)
  username?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  lastName?: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsBoolean()
  @IsOptional()
  temporaryPassword?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  roleKeys!: string[];
}
