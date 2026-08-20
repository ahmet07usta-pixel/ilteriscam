import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { TransitionShipmentDto } from './dto/transition-shipment.dto';
import { ShipmentsService } from './shipments.service';

@Controller()
export class ShipmentsController {
  constructor(private readonly shipmentsService: ShipmentsService) {}

  @Get('shipments')
  @Permissions(PERMISSIONS.SHIPMENTS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.shipmentsService.list(actor);
  }

  @Get('shipments/:shipmentId')
  @Permissions(PERMISSIONS.SHIPMENTS_READ)
  get(
    @Param('shipmentId') shipmentId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.shipmentsService.get(shipmentId, actor);
  }

  @Post('productions/:productionId/shipment')
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PERMISSIONS.SHIPMENTS_CREATE)
  create(
    @Param('productionId') productionId: string,
    @Body() body: CreateShipmentDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.shipmentsService.create(productionId, body, actor);
  }

  @Post('shipments/:shipmentId/transition')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.SHIPMENTS_TRANSITION)
  transition(
    @Param('shipmentId') shipmentId: string,
    @Body() body: TransitionShipmentDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.shipmentsService.transition(shipmentId, body, actor);
  }
}