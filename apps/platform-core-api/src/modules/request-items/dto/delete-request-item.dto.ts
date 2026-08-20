import { IsInt, Min } from 'class-validator';

export class DeleteRequestItemDto {
  @IsInt()
  @Min(1)
  version!: number;
}