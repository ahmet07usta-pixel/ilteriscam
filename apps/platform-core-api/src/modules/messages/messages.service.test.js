const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { ForbiddenException, NotFoundException } = require('@nestjs/common');
const { CompanyMembershipStatus, Role } = require('@prisma/client');
const { MessagesService } = require('./messages.service.ts');

const buyerActor = { sub: 'buyer-user', role: Role.SALES, permissions: [] };
const producerActor = { sub: 'producer-user', role: Role.PRODUCER, permissions: [] };
const otherProducerActor = { sub: 'other-producer-user', role: Role.PRODUCER, permissions: [] };
const adminActor = { sub: 'admin-user', role: Role.ADMIN, permissions: [] };

function createPrismaMock({ requests = [], memberships = [], recipients = [] } = {}) {
  const state = { messages: [] };
  return {
    state,
    request: {
      findUnique: async ({ where }) => requests.find((r) => r.id === where.id) ?? null,
      findMany: async ({ where }) => requests
        .filter((r) => where.companyId.in.includes(r.companyId))
        .map((r) => ({ ...r, recipients: recipients.filter((rec) => rec.requestId === r.id) })),
    },
    companyUserMembership: {
      findFirst: async ({ where }) => memberships.find((m) =>
        m.userId === where.userId
        && m.status === where.status
        && where.companyId.in.includes(m.companyId)) ?? null,
      findMany: async ({ where }) => memberships.filter((m) => m.userId === where.userId && m.status === where.status),
    },
    requestRecipient: {
      findUnique: async ({ where }) => recipients.find((r) =>
        r.requestId === where.requestId_companyId.requestId
        && r.companyId === where.requestId_companyId.companyId) ?? null,
      findMany: async ({ where }) => recipients.filter((r) => where.companyId.in.includes(r.companyId)),
    },
    message: {
      create: async ({ data }) => {
        const message = { id: `message-${state.messages.length + 1}`, createdAt: new Date(), ...data };
        state.messages.push(message);
        return { ...message, author: { id: data.authorUserId, fullName: 'Test User', email: 'test@example.invalid' } };
      },
      findMany: async ({ where, distinct }) => {
        let filtered = state.messages.filter((m) =>
          (!where.requestId || m.requestId === where.requestId)
          && (!where.counterpartyCompanyId || m.counterpartyCompanyId === where.counterpartyCompanyId));
        if (distinct) {
          const seen = new Set();
          filtered = filtered.filter((m) => {
            const key = `${m.requestId}:${m.counterpartyCompanyId}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
        return filtered.map((m) => ({ ...m, author: { id: m.authorUserId, fullName: 'Test User', email: 'test@example.invalid' } }));
      },
      findFirst: async ({ where }) => {
        const filtered = state.messages.filter((m) => m.requestId === where.requestId && m.counterpartyCompanyId === where.counterpartyCompanyId);
        return filtered.length ? filtered[filtered.length - 1] : null;
      },
      count: async ({ where }) => state.messages.filter((m) => m.requestId === where.requestId && m.counterpartyCompanyId === where.counterpartyCompanyId).length,
    },
    company: {
      findUnique: async ({ where }) => ({ id: where.id, legalName: `Company ${where.id}` }),
    },
  };
}

function createNotificationsMock() {
  const calls = [];
  return { calls, notifyCompany: async (companyId, event) => { calls.push({ companyId, event }); } };
}

function createService(overrides = {}) {
  const requests = overrides.requests ?? [
    { id: 'request-1', companyId: 'buyer-company', requestNumber: 'REQ-1', title: 'Test request' },
  ];
  const memberships = overrides.memberships ?? [
    { userId: buyerActor.sub, companyId: 'buyer-company', status: CompanyMembershipStatus.ACTIVE },
    { userId: producerActor.sub, companyId: 'producer-company', status: CompanyMembershipStatus.ACTIVE },
    { userId: otherProducerActor.sub, companyId: 'other-producer-company', status: CompanyMembershipStatus.ACTIVE },
  ];
  const recipients = overrides.recipients ?? [
    { requestId: 'request-1', companyId: 'producer-company' },
  ];
  const prisma = createPrismaMock({ requests, memberships, recipients });
  const notifications = createNotificationsMock();
  const service = new MessagesService(prisma, notifications);
  return { service, prisma, notifications };
}

test('postMessage lets the buyer post to a legitimate recipient producer and notifies that company', async () => {
  const { service, notifications } = createService();

  const message = await service.postMessage('request-1', {
    counterpartyCompanyId: 'producer-company',
    body: 'Merhaba',
  }, buyerActor);

  assert.equal(message.body, 'Merhaba');
  assert.equal(message.senderCompanyId, 'buyer-company');
  assert.equal(notifications.calls.length, 1);
  assert.equal(notifications.calls[0].companyId, 'producer-company');
  assert.equal(notifications.calls[0].event.type, 'NEW_MESSAGE');
});

test('postMessage lets the recipient producer reply and notifies the buyer company', async () => {
  const { service, notifications } = createService();

  const message = await service.postMessage('request-1', {
    counterpartyCompanyId: 'producer-company',
    body: 'Merhaba, ilgileniyoruz',
  }, producerActor);

  assert.equal(message.senderCompanyId, 'producer-company');
  assert.equal(notifications.calls[0].companyId, 'buyer-company');
});

test('postMessage rejects a producer that is not an actual recipient of the request', async () => {
  const { service } = createService();

  await assert.rejects(
    service.postMessage('request-1', {
      counterpartyCompanyId: 'other-producer-company',
      body: 'Bu talebe erisimim olmamali',
    }, otherProducerActor),
    ForbiddenException,
  );
});

test('postMessage rejects an actor with no membership in either side of the conversation', async () => {
  const { service } = createService();
  const strangerActor = { sub: 'stranger-user', role: Role.SALES, permissions: [] };

  await assert.rejects(
    service.postMessage('request-1', {
      counterpartyCompanyId: 'producer-company',
      body: 'Erisimim olmamali',
    }, strangerActor),
    ForbiddenException,
  );
});

test('postMessage throws NotFoundException for an unknown request', async () => {
  const { service } = createService();

  await assert.rejects(
    service.postMessage('unknown-request', {
      counterpartyCompanyId: 'producer-company',
      body: 'Merhaba',
    }, buyerActor),
    NotFoundException,
  );
});

test('listThread returns messages in order and blocks a competing producer from reading the thread', async () => {
  const { service } = createService();

  await service.postMessage('request-1', { counterpartyCompanyId: 'producer-company', body: 'Birinci mesaj' }, buyerActor);
  await service.postMessage('request-1', { counterpartyCompanyId: 'producer-company', body: 'Ikinci mesaj' }, producerActor);

  const thread = await service.listThread('request-1', 'producer-company', buyerActor);
  assert.equal(thread.length, 2);
  assert.equal(thread[0].body, 'Birinci mesaj');
  assert.equal(thread[1].body, 'Ikinci mesaj');

  await assert.rejects(
    service.listThread('request-1', 'producer-company', otherProducerActor),
    ForbiddenException,
  );
});

test('listThread allows admin oversight regardless of membership', async () => {
  const { service } = createService();
  await service.postMessage('request-1', { counterpartyCompanyId: 'producer-company', body: 'Merhaba' }, buyerActor);

  const thread = await service.listThread('request-1', 'producer-company', adminActor);
  assert.equal(thread.length, 1);
});

test('listConversations scopes buyer and producer to their own conversations only', async () => {
  const { service } = createService();
  await service.postMessage('request-1', { counterpartyCompanyId: 'producer-company', body: 'Merhaba' }, buyerActor);

  const buyerConvos = await service.listConversations(buyerActor);
  assert.equal(buyerConvos.length, 1);
  assert.equal(buyerConvos[0].counterpartyCompanyId, 'producer-company');

  const otherProducerConvos = await service.listConversations(otherProducerActor);
  assert.equal(otherProducerConvos.length, 0);
});
