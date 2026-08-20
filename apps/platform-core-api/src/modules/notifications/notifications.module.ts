import { Global, Module } from '@nestjs/common';

import {
  NotificationsService,
  NullNotificationPublisher,
} from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, NullNotificationPublisher],
  exports: [NotificationsService],
})
export class NotificationsModule {}
