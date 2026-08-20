import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ)
  list(@Query('limit') limit: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    const parsed = Number(limit ?? 100);
    return this.notificationsService.listForUser(actor.sub, Number.isNaN(parsed) ? 100 : parsed);
  }

  @Post(':id/read')
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ)
  markAsRead(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAsRead(id, actor.sub);
  }

  @Post('read-all')
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ)
  markAllAsRead(@CurrentUser() actor: AuthenticatedUser) {
    return this.notificationsService.markAllAsRead(actor.sub);
  }

  @Get('admin')
  @Permissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  listAll(@Query('limit') limit?: string) {
    const parsed = Number(limit ?? 100);
    return this.notificationsService.list(Number.isNaN(parsed) ? 100 : parsed);
  }

  @Post('queue')
  @Permissions(PERMISSIONS.NOTIFICATIONS_MANAGE)
  queue(
    @Body()
    payload: {
      userId: string;
      type: string;
      title: string;
      body?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.notificationsService.queue({
      ...payload,
      payload: payload.payload as any,
    });
  }
}
