const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { NotFoundException } = require('@nestjs/common');
const { CompanyMembershipStatus, NotificationStatus } = require('@prisma/client');
const { NotificationsService } = require('./notifications.service.ts');

function createPublisher() {
  const published = [];
  return { published, publish: async (event) => { published.push(event); } };
}

function createPrisma(options = {}) {
  const notifications = options.seed ? [...options.seed] : [];
  let nextId = notifications.length + 1;
  const captured = { membershipWhere: null };
  const prisma = {
    notification: {
      create: async ({ data }) => {
        const notification = {
          id: `notification-${nextId++}`,
          readAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        notifications.push(notification);
        return notification;
      },
      findMany: async ({ where }) => notifications.filter((item) => item.userId === where.userId),
      updateMany: async ({ where, data }) => {
        const matches = notifications.filter((item) => (
          (where.id === undefined || item.id === where.id)
          && item.userId === where.userId
          && (where.readAt === undefined || item.readAt === where.readAt)
        ));
        matches.forEach((item) => Object.assign(item, data));
        return { count: matches.length };
      },
      findFirst: async ({ where }) => (
        notifications.find((item) => item.id === where.id && item.userId === where.userId) ?? null
      ),
      findUniqueOrThrow: async ({ where }) => {
        const found = notifications.find((item) => item.id === where.id);
        if (!found) throw new Error('not found');
        return found;
      },
    },
    companyUserMembership: {
      findMany: async ({ where }) => {
        captured.membershipWhere = where;
        return options.members ?? [];
      },
    },
  };
  return { prisma, notifications, captured };
}

test('queue persists a PENDING notification for the target user and publishes the event', async () => {
  const { prisma, notifications } = createPrisma();
  const publisher = createPublisher();
  const service = new NotificationsService(prisma, publisher);

  const result = await service.queue({ userId: 'user-1', type: 'ORDER_CONFIRMED', title: 'Test title' });

  assert.equal(result.userId, 'user-1');
  assert.equal(result.status, NotificationStatus.PENDING);
  assert.equal(notifications.length, 1);
  assert.equal(publisher.published.length, 1);
});

test('notifyCompany queues one notification per active company member and skips inactive ones', async () => {
  const { prisma, notifications, captured } = createPrisma({
    members: [{ userId: 'user-1' }, { userId: 'user-2' }],
  });
  const service = new NotificationsService(prisma, createPublisher());

  await service.notifyCompany('company-1', { type: 'REQUEST_ASSIGNED', title: 'Yeni talep' });

  assert.equal(captured.membershipWhere.companyId, 'company-1');
  assert.equal(captured.membershipWhere.status, CompanyMembershipStatus.ACTIVE);
  assert.equal(notifications.length, 2);
  assert.deepEqual(notifications.map((item) => item.userId).sort(), ['user-1', 'user-2']);
});

test('listForUser only returns notifications belonging to that user', async () => {
  const { prisma } = createPrisma({
    seed: [
      { id: 'n1', userId: 'user-1', type: 'A', title: 'A', status: NotificationStatus.PENDING, readAt: null },
      { id: 'n2', userId: 'user-2', type: 'B', title: 'B', status: NotificationStatus.PENDING, readAt: null },
    ],
  });
  const service = new NotificationsService(prisma, createPublisher());

  const result = await service.listForUser('user-1');

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'n1');
});

test('markAsRead sets readAt only for the owning user and rejects otherwise', async () => {
  const { prisma } = createPrisma({
    seed: [{ id: 'n1', userId: 'user-1', type: 'A', title: 'A', status: NotificationStatus.PENDING, readAt: null }],
  });
  const service = new NotificationsService(prisma, createPublisher());

  const updated = await service.markAsRead('n1', 'user-1');
  assert.ok(updated.readAt instanceof Date);

  await assert.rejects(service.markAsRead('n1', 'other-user'), NotFoundException);
  await assert.rejects(service.markAsRead('missing', 'user-1'), NotFoundException);
});

test('markAllAsRead only touches the caller unread notifications', async () => {
  const { prisma, notifications } = createPrisma({
    seed: [
      { id: 'n1', userId: 'user-1', type: 'A', title: 'A', status: NotificationStatus.PENDING, readAt: null },
      { id: 'n2', userId: 'user-1', type: 'B', title: 'B', status: NotificationStatus.PENDING, readAt: null },
      { id: 'n3', userId: 'user-2', type: 'C', title: 'C', status: NotificationStatus.PENDING, readAt: null },
    ],
  });
  const service = new NotificationsService(prisma, createPublisher());

  const result = await service.markAllAsRead('user-1');

  assert.equal(result.success, true);
  assert.ok(notifications.find((item) => item.id === 'n1').readAt instanceof Date);
  assert.ok(notifications.find((item) => item.id === 'n2').readAt instanceof Date);
  assert.equal(notifications.find((item) => item.id === 'n3').readAt, null);
});
