import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReplaceRequestRecipientsDto } from './dto/replace-request-recipients.dto';
import { RequestActionDto } from './dto/request-action.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  @Post()
  @Permissions(PERMISSIONS.REQUESTS_CREATE)
  create(@Body() body: CreateRequestDto, @CurrentUser() actor?: AuthenticatedUser) {
    return this.requestsService.create(body, actor);
  }

  @Get()
  @Permissions(PERMISSIONS.REQUESTS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.requestsService.list(actor);
  }

  @Get('recipient-companies')
  @Permissions(PERMISSIONS.REQUESTS_CREATE)
  listRecipientCompanies(@CurrentUser() actor?: AuthenticatedUser, @Query('regionId') regionId?: string) {
    return this.requestsService.listRecipientCompanies(actor, regionId);
  }

  @Get(':requestId/recipients')
  @Permissions(PERMISSIONS.REQUESTS_READ)
  listRecipients(
    @Param('requestId') requestId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestsService.listRecipients(requestId, actor);
  }

  @Put(':requestId/recipients')
  @Permissions(PERMISSIONS.REQUEST_RECIPIENTS_MANAGE)
  replaceRecipients(
    @Param('requestId') requestId: string,
    @Body() body: ReplaceRequestRecipientsDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestsService.replaceRecipients(requestId, body, actor);
  }

  @Get(':requestId')
  @Permissions(PERMISSIONS.REQUESTS_READ)
  get(@Param('requestId') requestId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.requestsService.get(requestId, actor);
  }

  @Patch(':requestId')
  @Permissions(PERMISSIONS.REQUESTS_UPDATE)
  update(
    @Param('requestId') requestId: string,
    @Body() body: UpdateRequestDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestsService.update(requestId, body, actor);
  }

  @Post(':requestId/submit')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.REQUESTS_SUBMIT)
  submit(
    @Param('requestId') requestId: string,
    @Body() body: RequestActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestsService.submit(requestId, body.version, actor);
  }

  @Post(':requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.REQUESTS_CANCEL)
  cancel(
    @Param('requestId') requestId: string,
    @Body() body: RequestActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.requestsService.cancel(requestId, body.version, actor);
  }
}
