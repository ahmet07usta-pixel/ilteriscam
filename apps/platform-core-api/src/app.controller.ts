import { Controller, Get } from '@nestjs/common';

import { Public } from './common/decorators/public.decorator';

@Controller()
export class AppController {
  @Get()
  @Public()
  root() {
    return {
      service: 'platform-core-api',
      status: 'running',
      docs: '/docs',
    };
  }
}
