import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  companyLegalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  companyTradeName?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  businessDescription!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxNumber?: string;

  @IsOptional()
  @IsString()
  regionId?: string;

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
