import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { FinalizeCalculationDto } from './dto/finalize-calculation.dto';
import { QuotationCalculationsService } from './quotation-calculations.service';

@Controller('quotations/:quotationId/calculations')
export class QuotationCalculationsController {
  constructor(private readonly calculationsService: QuotationCalculationsService) {}

  @Post()
  @Permissions(PERMISSIONS.QUOTATION_CALCULATIONS_CREATE)
  generate(
    @Param('quotationId') quotationId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.calculationsService.generate(quotationId, actor);
  }

  @Post(':calculationId/finalize')
  @Permissions(PERMISSIONS.QUOTATION_CALCULATIONS_FINALIZE)
  finalize(
    @Param('quotationId') quotationId: string,
    @Param('calculationId') calculationId: string,
    @Body() body: FinalizeCalculationDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.calculationsService.finalize(
      quotationId,
      calculationId,
      body.quotationVersion,
      body.calculationVersion,
      actor,
    );
  }

  @Get()
  @Permissions(PERMISSIONS.QUOTATION_CALCULATIONS_READ)
  list(@Param('quotationId') quotationId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.calculationsService.list(quotationId, actor);
  }

  @Get(':calculationId')
  @Permissions(PERMISSIONS.QUOTATION_CALCULATIONS_READ)
  get(
    @Param('quotationId') quotationId: string,
    @Param('calculationId') calculationId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.calculationsService.get(quotationId, calculationId, actor);
  }
}