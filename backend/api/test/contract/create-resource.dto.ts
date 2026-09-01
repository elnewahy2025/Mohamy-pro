import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateResourceDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  count?: number;
}
