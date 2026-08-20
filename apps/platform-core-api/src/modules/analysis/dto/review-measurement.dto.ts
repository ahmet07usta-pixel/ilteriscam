import { MeasurementReviewAction, MeasurementUnit } from '@prisma/client';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class ReviewMeasurementDto {
  @IsString()
  @MinLength(1)
  detectedMeasurementId!: string;

  @IsEnum(MeasurementReviewAction)
  action!: MeasurementReviewAction;

  @IsInt()
  @Min(1)
  requestItemVersion!: number;

  @IsInt()
  @Min(1)
  analysisResultVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  quantity?: number;

  @IsOptional()
  @IsEnum(MeasurementUnit)
  unit?: MeasurementUnit;

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