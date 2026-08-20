import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;

export class CreateShipmentDto {
  @IsInt()
  @Min(1)
  productionVersion!: number;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  destinationAddress!: string;

  @IsDateString()
  plannedDepartureAt!: string;

  @IsDateString()
  estimatedDeliveryAt!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  carrier?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  trackingNumber?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  notes?: string;
}