import { IsInt, Min } from 'class-validator';

export class RequestActionDto {
  @IsInt()
  @Min(1)
  version!: number;
}
