import { MeasurementSource, MeasurementUnit } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class CreateRequestItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  productType?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  productCode?: string;

  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantity!: number;

  @IsEnum(MeasurementUnit)
  unit!: MeasurementUnit;

  @IsOptional()
  @IsEnum(MeasurementSource)
  measurementSource?: MeasurementSource;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  width?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  depth?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  thickness?: number;
}