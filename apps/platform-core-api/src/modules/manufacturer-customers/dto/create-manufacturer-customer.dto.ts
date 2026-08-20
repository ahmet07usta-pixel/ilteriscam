import { CompanyStatus } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateManufacturerCustomerDto {
  @IsString()
  manufacturerCompanyId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  companyName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  contactName!: string;

  @IsString()
  @Matches(/^\+?[0-9\s-]{10,20}$/, { message: 'phone must be a valid phone number' })
  phone!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  taxOffice!: string;

  @IsString()
  @Matches(/^\d{10,12}$/, { message: 'taxNo must be a 10 or 12 digit number' })
  taxNo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  address!: string;

  @IsString()
  @MinLength(1)
  city!: string;

  @IsString()
  @MinLength(1)
  region!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsEnum(CompanyStatus)
  status?: CompanyStatus;
}
