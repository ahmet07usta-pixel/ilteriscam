import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

type AuditRecordInput = {
  actorId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(payload: AuditRecordInput, client: Prisma.TransactionClient | PrismaService = this.prisma) {
    return client.auditLog.create({
      data: {
        actorId: payload.actorId,
        action: payload.action,
        resource: payload.resource,
        resourceId: payload.resourceId,
        metadata: payload.metadata,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
      },
    });
  }

  async list(limit = 100) {
    return this.prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }
}
