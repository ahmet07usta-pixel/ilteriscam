import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

export class InitiateAttachmentUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  mimeType!: string;

  @IsInt()
  @Min(1)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  requestItemId?: string;
}