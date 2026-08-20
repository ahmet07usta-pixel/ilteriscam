import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { ProductionsController } from './productions.controller';
import { ProductionsService } from './productions.service';

@Module({
  imports: [AuditModule],
  controllers: [ProductionsController],
  providers: [ProductionsService],
  exports: [ProductionsService],
})
export class ProductionsModule {}
