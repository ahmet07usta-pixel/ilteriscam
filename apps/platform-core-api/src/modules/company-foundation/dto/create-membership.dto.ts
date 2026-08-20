import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateMembershipDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  userId!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  role?: string;
}
