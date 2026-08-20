import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateProductionDto } from './dto/create-production.dto';
import { TransitionProductionDto } from './dto/transition-production.dto';
import { ProductionsService } from './productions.service';

@Controller()
export class ProductionsController {
  constructor(private readonly productionsService: ProductionsService) {}

  @Get('productions')
  @Permissions(PERMISSIONS.PRODUCTIONS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.productionsService.list(actor);
  }

  @Get('productions/:productionId')
  @Permissions(PERMISSIONS.PRODUCTIONS_READ)
  get(
    @Param('productionId') productionId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.productionsService.get(productionId, actor);
  }

  @Post('orders/:orderId/production')
  @HttpCode(HttpStatus.CREATED)
  @Permissions(PERMISSIONS.PRODUCTIONS_CREATE)
  create(
    @Param('orderId') orderId: string,
    @Body() body: CreateProductionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.productionsService.create(orderId, body, actor);
  }

  @Post('productions/:productionId/transition')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.PRODUCTIONS_TRANSITION)
  transition(
    @Param('productionId') productionId: string,
    @Body() body: TransitionProductionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.productionsService.transition(productionId, body, actor);
  }
}
