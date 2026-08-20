import { IsInt, Min } from 'class-validator';

export class FinalizeCalculationDto {
  @IsInt()
  @Min(1)
  quotationVersion!: number;

  @IsInt()
  @Min(1)
  calculationVersion!: number;
}