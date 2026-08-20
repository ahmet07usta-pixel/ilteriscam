import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { CompanyFoundationService } from './company-foundation.service';
import { CreateMembershipDto } from './dto/create-membership.dto';

@Controller(['companies/:companyId/members', 'companies/:companyId/memberships'])
export class CompanyMembershipsController {
  constructor(private readonly companyFoundationService: CompanyFoundationService) {}

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  listMemberships(
    @Param('companyId') companyId: string,
    @CurrentUser() user: { sub: string; role: any; permissions: string[] } | undefined,
  ) {
    return this.companyFoundationService.listMemberships(companyId, user as any);
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  addMembership(
    @Param('companyId') companyId: string,
    @Body() body: CreateMembershipDto,
    @CurrentUser() user: { sub: string } | undefined,
  ) {
    return this.companyFoundationService.addMembership(companyId, body.userId, body.role ?? 'MEMBER', user as any);
  }

  @Delete(':userId')
  @HttpCode(204)
  @Permissions(PERMISSIONS.USERS_MANAGE)
  removeMembership(
    @Param('companyId') companyId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: { sub: string } | undefined,
  ) {
    return this.companyFoundationService.removeMembership(companyId, userId, user as any);
  }
}
