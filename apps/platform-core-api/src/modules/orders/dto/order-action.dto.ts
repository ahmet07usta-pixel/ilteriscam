import { IsInt, Min } from 'class-validator';

export class OrderActionDto {
  @IsInt()
  @Min(1)
  version!: number;
}