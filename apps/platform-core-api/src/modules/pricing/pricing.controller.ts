import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreatePriceCatalogItemDto } from './dto/create-price-catalog-item.dto';
import { UpdatePriceCatalogItemDto } from './dto/update-price-catalog-item.dto';
import { PricingService } from './pricing.service';

@Controller('pricing/catalog-items')
export class PricingController {
  constructor(private readonly pricingService: PricingService) {}

  @Get()
  @Permissions(PERMISSIONS.PRICING_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.pricingService.list(actor);
  }

  @Post()
  @Permissions(PERMISSIONS.PRICING_MANAGE)
  create(@Body() body: CreatePriceCatalogItemDto, @CurrentUser() actor?: AuthenticatedUser) {
    return this.pricingService.create(body, actor);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.PRICING_MANAGE)
  update(
    @Param('id') id: string,
    @Body() body: UpdatePriceCatalogItemDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.pricingService.update(id, body, actor);
  }
}
