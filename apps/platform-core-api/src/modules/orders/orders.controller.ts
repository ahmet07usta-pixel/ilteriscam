import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderActionDto } from './dto/order-action.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @Permissions(PERMISSIONS.ORDERS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.ordersService.list(actor);
  }

  @Get(':orderId')
  @Permissions(PERMISSIONS.ORDERS_READ)
  get(@Param('orderId') orderId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.ordersService.get(orderId, actor);
  }

  @Post(':orderId/confirm')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.ORDERS_CONFIRM)
  confirm(
    @Param('orderId') orderId: string,
    @Body() body: OrderActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.ordersService.confirm(orderId, body.version, actor);
  }

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.ORDERS_CANCEL)
  cancel(
    @Param('orderId') orderId: string,
    @Body() body: CancelOrderDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.ordersService.cancel(orderId, body.version, body.cancellationReason, actor);
  }
}