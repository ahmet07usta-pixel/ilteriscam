import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { QuotationActionDto } from './dto/quotation-action.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QuotationsService } from './quotations.service';

@Controller()
export class QuotationsController {
  constructor(private readonly quotationsService: QuotationsService) {}

  @Post('requests/:requestId/quotations')
  @Permissions(PERMISSIONS.QUOTATIONS_CREATE)
  create(
    @Param('requestId') requestId: string,
    @Body() body: CreateQuotationDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.create(requestId, body, actor);
  }

  @Get('requests/:requestId/quotations')
  @Permissions(PERMISSIONS.QUOTATIONS_READ)
  listForRequest(
    @Param('requestId') requestId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.listForRequest(requestId, actor);
  }

  @Get('quotations')
  @Permissions(PERMISSIONS.QUOTATIONS_READ)
  list(@CurrentUser() actor?: AuthenticatedUser) {
    return this.quotationsService.list(actor);
  }

  @Get('quotations/:quotationId')
  @Permissions(PERMISSIONS.QUOTATIONS_READ)
  get(@Param('quotationId') quotationId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.quotationsService.get(quotationId, actor);
  }

  @Patch('quotations/:quotationId')
  @Permissions(PERMISSIONS.QUOTATIONS_UPDATE)
  update(
    @Param('quotationId') quotationId: string,
    @Body() body: UpdateQuotationDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.update(quotationId, body, actor);
  }

  @Post('quotations/:quotationId/send')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.QUOTATIONS_SEND)
  send(
    @Param('quotationId') quotationId: string,
    @Body() body: QuotationActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.send(quotationId, body.version, actor);
  }

  @Post('quotations/:quotationId/revise')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.QUOTATIONS_UPDATE)
  revise(
    @Param('quotationId') quotationId: string,
    @Body() body: QuotationActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.revise(quotationId, body.version, actor);
  }

  @Post('quotations/:quotationId/withdraw')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.QUOTATIONS_WITHDRAW)
  withdraw(
    @Param('quotationId') quotationId: string,
    @Body() body: QuotationActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.withdraw(quotationId, body.version, actor);
  }

  @Post('quotations/:quotationId/reject')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.QUOTATIONS_DECIDE)
  reject(
    @Param('quotationId') quotationId: string,
    @Body() body: QuotationActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.reject(quotationId, body.version, actor);
  }

  @Post('quotations/:quotationId/accept')
  @HttpCode(HttpStatus.OK)
  @Permissions(PERMISSIONS.QUOTATIONS_DECIDE)
  accept(
    @Param('quotationId') quotationId: string,
    @Body() body: QuotationActionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.quotationsService.accept(quotationId, body.version, actor);
  }
}
