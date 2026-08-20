import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateRequestItemDto } from './dto/create-request-item.dto';
import { DeleteRequestItemDto } from './dto/delete-request-item.dto';
import { UpdateRequestItemDto } from './dto/update-request-item.dto';
import { RequestItemsService } from './request-items.service';

@Controller('requests/:requestId/items')
export class RequestItemsController {
  constructor(private readonly requestItemsService: RequestItemsService) {}

  @Post()
  @Permissions(PERMISSIONS.REQUEST_ITEMS_CREATE)
  create(
    @Param('requestId') requestId: string,
    @Body() body: CreateRequestItemDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestItemsService.create(requestId, body, actor);
  }

  @Get()
  @Permissions(PERMISSIONS.REQUEST_ITEMS_READ)
  list(@Param('requestId') requestId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.requestItemsService.list(requestId, actor);
  }

  @Get(':itemId')
  @Permissions(PERMISSIONS.REQUEST_ITEMS_READ)
  get(
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestItemsService.get(requestId, itemId, actor);
  }

  @Patch(':itemId')
  @Permissions(PERMISSIONS.REQUEST_ITEMS_UPDATE)
  update(
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @Body() body: UpdateRequestItemDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestItemsService.update(requestId, itemId, body, actor);
  }

  @Delete(':itemId')
  @Permissions(PERMISSIONS.REQUEST_ITEMS_DELETE)
  delete(
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @Body() body: DeleteRequestItemDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestItemsService.delete(requestId, itemId, body.version, actor);
  }
}