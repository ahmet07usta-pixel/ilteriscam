import { ShipmentStatus } from '@prisma/client';
import { IsEnum, IsInt, Min } from 'class-validator';

export class TransitionShipmentDto {
  @IsInt()
  @Min(1)
  version!: number;

  @IsEnum(ShipmentStatus)
  toStatus!: ShipmentStatus;
}