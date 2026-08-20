import { ArrayUnique, IsArray, IsInt, IsString, Min } from 'class-validator';

export class ReplaceRequestRecipientsDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  companyIds!: string[];
}
