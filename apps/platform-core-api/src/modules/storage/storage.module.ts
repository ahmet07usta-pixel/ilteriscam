import { Module } from '@nestjs/common';

import { LocalStorageAdapter } from './local-storage.adapter';
import { STORAGE_PORT } from './storage.contract';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [
    LocalStorageAdapter,
    { provide: STORAGE_PORT, useExisting: LocalStorageAdapter },
  ],
  exports: [STORAGE_PORT],
})
export class StorageModule {}