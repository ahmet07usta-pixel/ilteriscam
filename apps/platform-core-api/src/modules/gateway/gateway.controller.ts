import { Controller, Get } from '@nestjs/common';

import { Public } from '../../common/decorators/public.decorator';

@Controller('gateway')
export class GatewayController {
  @Get('routes')
  @Public()
  routes() {
    return {
      service: 'platform-core-api',
      version: 'v1',
      routes: {
        auth: '/auth',
        users: '/users',
        audit: '/audit',
        notifications: '/notifications',
        health: '/health',
      },
      note: 'Gateway boundary is ready for future service decomposition.',
    };
  }
}
