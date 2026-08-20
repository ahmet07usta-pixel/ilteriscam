import { CompanyType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyLegalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyTradeName?: string;

  @IsEnum(CompanyType)
  companyType!: CompanyType;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
