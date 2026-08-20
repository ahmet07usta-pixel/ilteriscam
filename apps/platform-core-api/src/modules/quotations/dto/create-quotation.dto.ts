import { IsDateString, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

export class CreateQuotationDto {
  @IsString()
  @MinLength(1)
  manufacturerCompanyId!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalAmount!: number;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @IsInt()
  @Min(1)
  leadTimeDays!: number;

  @IsDateString()
  validUntil!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}
