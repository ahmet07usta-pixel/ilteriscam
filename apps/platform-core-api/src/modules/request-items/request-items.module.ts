import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { RequestItemsController } from './request-items.controller';
import { RequestItemsService } from './request-items.service';

@Module({
  imports: [AuditModule],
  controllers: [RequestItemsController],
  providers: [RequestItemsService],
  exports: [RequestItemsService],
})
export class RequestItemsModule {}