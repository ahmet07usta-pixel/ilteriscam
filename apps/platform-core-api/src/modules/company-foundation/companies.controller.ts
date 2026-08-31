import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CompanyStatus, CompanyType, CompanyVerificationStatus } from '@prisma/client';
import { Request } from 'express';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { CompanyFoundationService } from './company-foundation.service';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companyFoundationService: CompanyFoundationService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  listCompanies(@CurrentUser() user: { sub: string; role: any; permissions: string[] } | undefined) {
    return this.companyFoundationService.listCompanies(user as any);
  }

  @Get(':companyId')
  @Permissions(PERMISSIONS.USERS_READ)
  getCompany(
    @Param('companyId') companyId: string,
    @CurrentUser() user: { sub: string; role: any; permissions: string[] } | undefined,
  ) {
    return this.companyFoundationService.getCompany(companyId, user as any);
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  createCompany(
    @Body() body: CreateCompanyDto,
    @CurrentUser() user: { sub: string } | undefined,
  ) {
    return this.companyFoundationService.createCompany(
      {
        legalName: body.legalName,
        tradeName: body.tradeName,
        companyType: body.companyType ?? CompanyType.OTHER,
        regionId: body.regionId,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone,
        taxNumber: body.taxNumber,
        iban: body.iban,
        verificationStatus: body.verificationStatus ?? CompanyVerificationStatus.PENDING,
        status: body.status ?? CompanyStatus.ACTIVE,
      },
      user as any,
    );
  }

  @Patch(':companyId')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  updateCompany(
    @Param('companyId') companyId: string,
    @Body() body: UpdateCompanyDto,
    @CurrentUser() user: { sub: string } | undefined,
  ) {
    return this.companyFoundationService.updateCompany(
      companyId,
      {
        legalName: body.legalName,
        tradeName: body.tradeName,
        companyType: body.companyType,
        regionId: body.regionId,
        contactEmail: body.contactEmail,
        contactPhone: body.contactPhone,
        taxNumber: body.taxNumber,
        iban: body.iban,
        verificationStatus: body.verificationStatus,
        status: body.status,
      },
      user as any,
    );
  }
}
