import { IsInt, Min } from 'class-validator';

export class QuotationActionDto {
  @IsInt()
  @Min(1)
  version!: number;
}
