import { Module } from '@nestjs/common';

import { ManufacturerCustomersController } from './manufacturer-customers.controller';
import { ManufacturerCustomersService } from './manufacturer-customers.service';

@Module({
  controllers: [ManufacturerCustomersController],
  providers: [ManufacturerCustomersService],
  exports: [ManufacturerCustomersService],
})
export class ManufacturerCustomersModule {}
