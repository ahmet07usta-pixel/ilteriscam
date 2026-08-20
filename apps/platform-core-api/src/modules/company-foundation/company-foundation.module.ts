import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { CompaniesController } from './companies.controller';
import { CompanyMembershipsController } from './company-memberships.controller';
import { CompanyFoundationService } from './company-foundation.service';
import { RegionsController } from './regions.controller';

@Module({
  imports: [AuditModule],
  controllers: [CompaniesController, RegionsController, CompanyMembershipsController],
  providers: [CompanyFoundationService],
  exports: [CompanyFoundationService],
})
export class CompanyFoundationModule {}
