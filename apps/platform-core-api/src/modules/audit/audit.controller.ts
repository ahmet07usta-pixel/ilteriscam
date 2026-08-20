import { Controller, Get, Query } from '@nestjs/common';

import { Permissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '../rbac/permissions';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Permissions(PERMISSIONS.AUDIT_READ)
  list(@Query('limit') limit?: string) {
    const parsed = Number(limit ?? 100);
    return this.auditService.list(Number.isNaN(parsed) ? 100 : parsed);
  }
}
