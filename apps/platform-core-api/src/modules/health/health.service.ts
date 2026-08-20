import { Injectable } from '@nestjs/common';

import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

  async check() {
    const dbStarted = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbDuration = Date.now() - dbStarted;

    const redisStarted = Date.now();
    const redisPing = await this.redisService.ping();
    const redisDuration = Date.now() - redisStarted;

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: 'up',
          responseTimeMs: dbDuration,
        },
        redis: {
          status: redisPing === 'PONG' ? 'up' : 'degraded',
          responseTimeMs: redisDuration,
          ping: redisPing,
        },
      },
    };
  }
}
