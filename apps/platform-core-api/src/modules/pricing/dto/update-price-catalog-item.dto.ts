import { PriceCatalogStatus } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdatePriceCatalogItemDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  productType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

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
  defaultDiscountRate?: number;

  @IsOptional()
  @IsEnum(PriceCatalogStatus)
  status?: PriceCatalogStatus;
}
