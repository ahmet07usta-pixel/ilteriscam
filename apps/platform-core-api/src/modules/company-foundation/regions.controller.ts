import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { CompanyFoundationService } from './company-foundation.service';
import { CreateRegionDto } from './dto/create-region.dto';
import { UpdateRegionDto } from './dto/update-region.dto';

@Controller('regions')
export class RegionsController {
  constructor(private readonly companyFoundationService: CompanyFoundationService) {}

  @Get()
  @Public()
  listRegions(@CurrentUser() user: { sub: string; role: any; permissions: string[] } | undefined) {
    return this.companyFoundationService.listRegions(user as any);
  }

  @Get(':regionId')
  @Permissions(PERMISSIONS.USERS_READ)
  getRegion(
    @Param('regionId') regionId: string,
    @CurrentUser() user: { sub: string; role: any; permissions: string[] } | undefined,
  ) {
    return this.companyFoundationService.getRegion(regionId, user as any);
  }

  @Post()
  @Permissions(PERMISSIONS.USERS_MANAGE)
  createRegion(@Body() body: CreateRegionDto, @CurrentUser() user: { sub: string } | undefined) {
    return this.companyFoundationService.createRegion(
      {
        name: body.name,
        parentRegionId: body.parentRegionId,
        regionType: body.regionType,
        code: body.code,
        country: body.country,
        city: body.city,
        timezone: body.timezone,
        status: body.status,
      },
      user as any,
    );
  }

  @Patch(':regionId')
  @Permissions(PERMISSIONS.USERS_MANAGE)
  updateRegion(
    @Param('regionId') regionId: string,
    @Body() body: UpdateRegionDto,
    @CurrentUser() user: { sub: string } | undefined,
  ) {
    return this.companyFoundationService.updateRegion(regionId, body, user as any);
  }
}
