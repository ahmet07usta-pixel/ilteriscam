import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { PricingModule } from '../pricing/pricing.module';
import { QuotationCalculationsController } from './quotation-calculations.controller';
import { QuotationCalculationsService } from './quotation-calculations.service';

@Module({
  imports: [AuditModule, PricingModule],
  controllers: [QuotationCalculationsController],
  providers: [QuotationCalculationsService],
  exports: [QuotationCalculationsService],
})
export class QuotationCalculationsModule {}