import { ProductionStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class TransitionProductionDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsEnum(ProductionStatus)
  toStatus!: ProductionStatus;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;
}
