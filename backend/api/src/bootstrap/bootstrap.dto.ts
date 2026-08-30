import { IsString, MinLength } from 'class-validator';

export class BootstrapDto {
  @IsString()
  @MinLength(1)
  secret!: string;
}
