import { IsInt, Min } from 'class-validator';

export class AttachmentVersionDto {
  @IsInt()
  @Min(1)
  version!: number;
}