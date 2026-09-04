import { MeasurementUnit, PriceCatalogStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreatePriceCatalogItemDto {
  @IsString()
  companyId!: string;

  @IsString()
  @MinLength(1)
  productCode!: string;

  @IsString()
  @MinLength(1)
  productType!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(MeasurementUnit)
  baseUnit!: MeasurementUnit;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minimumOrderAmount?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultWasteRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultDiscountRate?: number;

  @IsOptional()
  @IsEnum(PriceCatalogStatus)
  status?: PriceCatalogStatus;
}
