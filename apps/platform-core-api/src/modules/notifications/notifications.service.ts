import { Injectable, NotFoundException } from '@nestjs/common';
import { CompanyMembershipStatus, NotificationStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

export type NotificationEvent = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  payload?: Prisma.InputJsonValue;
};

export type CompanyNotificationEvent = Omit<NotificationEvent, 'userId'>;

export interface NotificationPublisherPort {
  publish(event: NotificationEvent): Promise<void>;
}

@Injectable()
export class NullNotificationPublisher implements NotificationPublisherPort {
  async publish(_event: NotificationEvent): Promise<void> {
    return Promise.resolve();
  }
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publisher: NullNotificationPublisher,
  ) {}

  async queue(event: NotificationEvent) {
    const notification = await this.prisma.notification.create({
      data: {
        userId: event.userId,
        type: event.type,
        title: event.title,
        body: event.body,
        payload: event.payload,
        status: NotificationStatus.PENDING,
      },
    });

    await this.publisher.publish(event);

    return notification;
  }

  async notifyCompany(companyId: string, event: CompanyNotificationEvent) {
    const memberships = await this.prisma.companyUserMembership.findMany({
      where: { companyId, status: CompanyMembershipStatus.ACTIVE },
      select: { userId: true },
    });

    await Promise.all(
      memberships.map((membership) => this.queue({ ...event, userId: membership.userId })),
    );
  }

  async markAsSent(notificationId: string) {
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { status: NotificationStatus.SENT },
    });
  }

  async list(limit = 100) {
    return this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async listForUser(userId: string, limit = 100) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId, readAt: null },
      data: { readAt: new Date() },
    });

    if (result.count === 0) {
      const existing = await this.prisma.notification.findFirst({ where: { id: notificationId, userId } });
      if (!existing) {
        throw new NotFoundException('Notification not found');
      }
    }

    return this.prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
  }

  async markAllAsRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });

    return { success: true } as const;
  }
}
