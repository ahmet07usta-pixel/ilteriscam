import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateManufacturerCustomerDto } from './dto/create-manufacturer-customer.dto';
import { UpdateManufacturerCustomerDto } from './dto/update-manufacturer-customer.dto';
import { ManufacturerCustomersService } from './manufacturer-customers.service';

@Controller('manufacturer-customers')
export class ManufacturerCustomersController {
  constructor(private readonly manufacturerCustomersService: ManufacturerCustomersService) {}

  @Get()
  @Permissions(PERMISSIONS.MANUFACTURER_CUSTOMERS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.manufacturerCustomersService.list(actor);
  }

  @Post()
  @Permissions(PERMISSIONS.MANUFACTURER_CUSTOMERS_MANAGE)
  create(@Body() body: CreateManufacturerCustomerDto, @CurrentUser() actor?: AuthenticatedUser) {
    return this.manufacturerCustomersService.create(body, actor);
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.MANUFACTURER_CUSTOMERS_MANAGE)
  update(
    @Param('id') id: string,
    @Body() body: UpdateManufacturerCustomerDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.manufacturerCustomersService.update(id, body, actor);
  }

  @Post(':id/prepare-invite')
  @Permissions(PERMISSIONS.MANUFACTURER_CUSTOMERS_MANAGE)
  prepareInvite(@Param('id') id: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.manufacturerCustomersService.prepareInvite(id, actor);
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.MANUFACTURER_CUSTOMERS_MANAGE)
  remove(@Param('id') id: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.manufacturerCustomersService.remove(id, actor);
  }
}
