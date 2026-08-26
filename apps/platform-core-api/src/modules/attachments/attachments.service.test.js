const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} = require('@nestjs/common');
const { AttachmentStatus, RequestStatus, Role } = require('@prisma/client');
const { AttachmentsService } = require('./attachments.service.ts');
const { StorageValidationError } = require('../storage/storage.contract.ts');

const actor = {
  sub: 'buyer-user',
  email: 'buyer@example.invalid',
  role: Role.SALES,
  permissions: ['attachments.read', 'attachments.create', 'attachments.delete'],
  tokenType: 'access',
};

function requestFixture(overrides = {}) {
  return { id: 'request-1', companyId: 'buyer-company', status: RequestStatus.DRAFT, ...overrides };
}

function attachmentFixture(overrides = {}) {
  return {
    id: 'attachment-1',
    requestId: 'request-1',
    requestItemId: null,
    fileName: 'drawing.pdf',
    mimeType: 'application/pdf',
    storageProvider: 'local',
    storageKey: 'a'.repeat(32),
    sizeBytes: 12n,
    checksum: 'pending:test',
    uploadedByUserId: actor.sub,
    analysisEligible: false,
    status: AttachmentStatus.PENDING_UPLOAD,
    version: 1,
    createdAt: new Date('2026-08-08T00:00:00Z'),
    updatedAt: new Date('2026-08-08T00:00:00Z'),
    ...overrides,
  };
}

function createHarness(options = {}) {
  const request = options.request === undefined ? requestFixture() : options.request;
  const attachments = [...(options.attachments ?? [])];
  const captured = { creates: [], updates: [], storageInitiations: [], storageDeletes: [] };

  const requestDelegate = { findFirst: async () => request };
  const requestItemDelegate = {
    findFirst: async ({ where }) => options.requestItemValid === false
      ? null
      : { id: where.id, requestId: where.requestId },
  };
  const attachmentDelegate = {
    create: async ({ data }) => {
      captured.creates.push(data);
      const created = attachmentFixture({ ...data, id: `attachment-${attachments.length + 1}` });
      attachments.push(created);
      return created;
    },
    findMany: async () => attachments.filter((attachment) => attachment.status !== AttachmentStatus.DELETED),
    findFirst: async ({ where }) => attachments.find((attachment) => (
      attachment.id === where.id && attachment.requestId === where.requestId
    )) ?? null,
    updateMany: async (args) => {
      captured.updates.push(args);
      if (options.updateCount === 0) return { count: 0 };
      const index = attachments.findIndex((attachment) => (
        attachment.id === args.where.id
        && attachment.requestId === args.where.requestId
        && attachment.version === args.where.version
        && attachment.status === args.where.status
      ));
      if (index < 0) return { count: 0 };
      const nextVersion = attachments[index].version + 1;
      attachments[index] = { ...attachments[index], ...args.data, version: nextVersion };
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }) => {
      const attachment = attachments.find((candidate) => candidate.id === where.id);
      if (!attachment) throw new Error('Attachment not found');
      return attachment;
    },
  };
  const transaction = {
    request: requestDelegate,
    requestItem: requestItemDelegate,
    attachment: attachmentDelegate,
  };
  const prisma = {
    ...transaction,
    $transaction: async (operation) => operation(transaction),
  };
  const audit = {
    records: [],
    record: async (payload, client) => {
      audit.records.push({ payload, client });
      return payload;
    },
  };
  const storage = {
    initiateUpload: async (input) => {
      captured.storageInitiations.push(input);
      return {
        provider: 'local',
        uploadUrl: '/api/v1/storage/uploads/token',
        expiresAt: new Date('2026-08-08T00:05:00Z'),
      };
    },
    completeUpload: async () => {
      if (options.completeError) throw options.completeError;
      return {
        checksum: 'verified-sha256',
        detectedMimeType: 'application/pdf',
        sizeBytes: 12,
      };
    },
    getDownloadUrl: async () => ({
      url: '/api/v1/storage/downloads/token',
      expiresAt: new Date('2026-08-08T00:05:00Z'),
    }),
    deleteObject: async (storageKey) => {
      captured.storageDeletes.push(storageKey);
      if (options.deleteError) throw options.deleteError;
    },
  };
  const config = { getOrThrow: () => options.maxFileSizeBytes ?? 1024 };
  const analysis = {
    startCalls: [],
    start: async (requestId, attachmentId, actorArg) => {
      analysis.startCalls.push({ requestId, attachmentId, actor: actorArg });
    },
  };
  return {
    service: new AttachmentsService(prisma, audit, config, storage, analysis),
    attachments,
    audit,
    captured,
    storage,
    transaction,
    analysis,
  };
}

const validInput = { fileName: 'drawing.pdf', mimeType: 'application/pdf', sizeBytes: 12 };

test('upload init creates server-owned pending metadata and returns an upload URL', async () => {
  const harness = createHarness();

  const result = await harness.service.initiateUpload('request-1', validInput, actor);

  assert.equal(result.attachment.status, AttachmentStatus.PENDING_UPLOAD);
  assert.equal(result.attachment.sizeBytes, 12);
  assert.equal(result.upload.url, '/api/v1/storage/uploads/token');
  assert.equal(harness.captured.creates[0].analysisEligible, false);
  assert.equal(harness.audit.records[0].client, harness.transaction);
  assert.equal('storageKey' in result.attachment, false);
  assert.equal('checksum' in result.attachment, false);
});

test('unauthorized tenant access is rejected before storage initiation', async () => {
  const harness = createHarness({ request: null });

  await assert.rejects(harness.service.initiateUpload('request-1', validInput, actor), NotFoundException);
  assert.equal(harness.captured.storageInitiations.length, 0);
});

test('requestItemId belonging to another Request is rejected', async () => {
  const harness = createHarness({ requestItemValid: false });

  await assert.rejects(
    harness.service.initiateUpload('request-1', { ...validInput, requestItemId: 'foreign-item' }, actor),
    BadRequestException,
  );
  assert.equal(harness.captured.storageInitiations.length, 0);
});

test('invalid path-like filename is rejected', async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.service.initiateUpload('request-1', { ...validInput, fileName: '../drawing.pdf' }, actor),
    BadRequestException,
  );
});

test('unsupported MIME type is rejected', async () => {
  const harness = createHarness();
  await assert.rejects(
    harness.service.initiateUpload('request-1', { ...validInput, mimeType: 'application/x-msdownload' }, actor),
    BadRequestException,
  );
});

test('file exceeding configured size limit is rejected', async () => {
  const harness = createHarness({ maxFileSizeBytes: 10 });
  await assert.rejects(harness.service.initiateUpload('request-1', validInput, actor), BadRequestException);
});

test('client cannot override storageKey', async () => {
  const harness = createHarness();
  await harness.service.initiateUpload('request-1', { ...validInput, storageKey: 'client-key' }, actor);

  assert.notEqual(harness.captured.creates[0].storageKey, 'client-key');
  assert.match(harness.captured.creates[0].storageKey, /^[a-f0-9]{32}$/);
});

test('client cannot override status', async () => {
  const harness = createHarness();
  await harness.service.initiateUpload(
    'request-1',
    { ...validInput, status: AttachmentStatus.AVAILABLE },
    actor,
  );
  assert.equal(harness.captured.creates[0].status, AttachmentStatus.PENDING_UPLOAD);
});

test('upload complete transitions PENDING_UPLOAD to AVAILABLE with CAS', async () => {
  const harness = createHarness({ attachments: [attachmentFixture()] });

  const result = await harness.service.completeUpload('request-1', 'attachment-1', 1, actor);

  assert.equal(result.status, AttachmentStatus.AVAILABLE);
  assert.equal(result.version, 2);
  assert.deepEqual(harness.captured.updates[0].where, {
    id: 'attachment-1',
    requestId: 'request-1',
    version: 1,
    status: AttachmentStatus.PENDING_UPLOAD,
  });
  assert.equal(harness.audit.records[0].payload.action, 'ATTACHMENT_UPLOADED');
});

test('a second upload complete is rejected', async () => {
  const harness = createHarness({ attachments: [attachmentFixture()] });
  await harness.service.completeUpload('request-1', 'attachment-1', 1, actor);

  await assert.rejects(
    harness.service.completeUpload('request-1', 'attachment-1', 2, actor),
    ConflictException,
  );
});

test('another tenant cannot complete a pending upload even when the attachment ID is known', async () => {
  const harness = createHarness({ request: null, attachments: [attachmentFixture()] });
  let storageCalled = false;
  harness.storage.completeUpload = async () => {
    storageCalled = true;
  };

  await assert.rejects(
    harness.service.completeUpload('request-1', 'attachment-1', 1, actor),
    NotFoundException,
  );
  assert.equal(storageCalled, false);
  assert.equal(harness.captured.updates.length, 0);
});

test('download applies Request authorization before issuing a URL', async () => {
  const harness = createHarness({
    request: null,
    attachments: [attachmentFixture({ status: AttachmentStatus.AVAILABLE })],
  });
  let downloadCalled = false;
  harness.storage.getDownloadUrl = async () => {
    downloadCalled = true;
  };

  await assert.rejects(
    harness.service.getDownloadUrl('request-1', 'attachment-1', actor),
    NotFoundException,
  );
  assert.equal(downloadCalled, false);
});

test('delete applies owner authorization', async () => {
  const harness = createHarness({
    request: null,
    attachments: [attachmentFixture({ status: AttachmentStatus.AVAILABLE })],
  });
  await assert.rejects(harness.service.delete('request-1', 'attachment-1', 1, actor), NotFoundException);
  assert.equal(harness.captured.storageDeletes.length, 0);
});

test('version mismatch produces a concurrency conflict', async () => {
  const harness = createHarness({ attachments: [attachmentFixture()] });

  await assert.rejects(
    harness.service.completeUpload('request-1', 'attachment-1', 9, actor),
    (error) => error instanceof ConflictException
      && error.message === 'Attachment was modified by another operation',
  );
  assert.equal(harness.audit.records.length, 0);
});

test('physical delete failure leaves metadata safely soft-deleted', async () => {
  const harness = createHarness({
    attachments: [attachmentFixture({ status: AttachmentStatus.AVAILABLE, checksum: 'verified' })],
    deleteError: new Error('storage offline'),
  });

  await assert.rejects(
    harness.service.delete('request-1', 'attachment-1', 1, actor),
    ServiceUnavailableException,
  );
  assert.equal(harness.attachments[0].status, AttachmentStatus.DELETED);
  assert.equal(harness.attachments[0].version, 2);
  assert.equal(harness.audit.records[0].payload.action, 'ATTACHMENT_DELETED');
});

test('failed server-side object verification quarantines the upload', async () => {
  const harness = createHarness({
    attachments: [attachmentFixture()],
    completeError: new StorageValidationError('Stored object type is not supported'),
  });

  await assert.rejects(
    harness.service.completeUpload('request-1', 'attachment-1', 1, actor),
    BadRequestException,
  );
  assert.equal(harness.attachments[0].status, AttachmentStatus.QUARANTINED);
  assert.equal(harness.attachments[0].version, 2);
  assert.equal(harness.audit.records[0].payload.action, 'ATTACHMENT_UPLOAD_FAILED');
});