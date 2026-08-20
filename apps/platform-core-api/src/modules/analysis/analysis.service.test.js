const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} = require('@nestjs/common');
const {
  AnalysisJobStatus,
  AnalysisReviewStatus,
  AttachmentStatus,
  GeometryType,
  MeasurementReviewAction,
  MeasurementStatus,
  MeasurementUnit,
  RequestStatus,
  Role,
} = require('@prisma/client');
const { AnalysisService } = require('./analysis.service.ts');

const actor = {
  sub: 'buyer-user',
  email: 'buyer@example.invalid',
  role: Role.SALES,
  permissions: ['analysis.read', 'analysis.create', 'analysis.review'],
  tokenType: 'access',
};

function requestFixture(overrides = {}) {
  return { id: 'request-1', companyId: 'buyer-company', status: RequestStatus.DRAFT, ...overrides };
}

function attachmentFixture(overrides = {}) {
  return {
    id: 'attachment-1',
    requestId: 'request-1',
    requestItemId: 'item-1',
    fileName: 'drawing.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 120n,
    checksum: 'verified-checksum',
    status: AttachmentStatus.AVAILABLE,
    ...overrides,
  };
}

function itemFixture(overrides = {}) {
  return {
    id: 'item-1',
    requestId: 'request-1',
    quantity: 2,
    unit: MeasurementUnit.PIECE,
    widthMm: 10,
    heightMm: 20,
    lengthMm: null,
    depthMm: null,
    thicknessMm: 4,
    calculatedAreaM2: 0.0002,
    calculatedLengthM: null,
    calculatedVolumeM3: null,
    sourceAnalysisResultId: null,
    measurementSource: null,
    measurementStatus: MeasurementStatus.PENDING_REVIEW,
    version: 1,
    ...overrides,
  };
}

function resultFixture(overrides = {}) {
  return {
    id: 'result-1',
    analysisJobId: 'job-1',
    resultVersion: 1,
    schemaVersion: 1,
    provider: 'deterministic',
    model: 'measurement-fixture',
    modelVersion: '1.0.0',
    confidence: 0.9,
    warnings: [],
    assumptions: [],
    reviewStatus: AnalysisReviewStatus.PENDING,
    version: 1,
    createdAt: new Date('2026-08-08T00:00:00Z'),
    ...overrides,
  };
}

function detectedFixture(overrides = {}) {
  return {
    id: 'measurement-1',
    analysisResultId: 'result-1',
    ordinal: 1,
    label: 'Panel',
    geometryType: GeometryType.RECTANGLE,
    widthMm: 1200,
    heightMm: 800,
    lengthMm: 2500,
    depthMm: 10,
    thicknessMm: 8,
    quantity: 3,
    unit: MeasurementUnit.PIECE,
    confidence: 0.9,
    ...overrides,
  };
}

function createHarness(options = {}) {
  const request = options.request === undefined ? requestFixture() : options.request;
  const attachment = options.attachment === undefined ? attachmentFixture() : options.attachment;
  const items = [options.item ?? itemFixture()];
  const jobs = [...(options.jobs ?? [])];
  const results = [...(options.results ?? [])];
  const measurements = [...(options.measurements ?? [])];
  const reviews = [];
  const captured = {
    jobUpdates: [], resultUpdates: [], itemUpdates: [], quotationWrites: 0, orderWrites: 0,
    enqueuedJobIds: [], providerCalls: 0,
  };

  const requestDelegate = { findFirst: async () => request };
  const attachmentDelegate = {
    findFirst: async ({ where }) => attachment
      && attachment.id === where.id
      && attachment.requestId === where.requestId ? attachment : null,
  };
  const jobDelegate = {
    findFirst: async ({ where }) => jobs.find((job) => (
      job.requestId === where.requestId
      && job.attachmentId === where.attachmentId
      && where.status.in.includes(job.status)
    )) ?? null,
    create: async ({ data }) => {
      const job = {
        id: `job-${jobs.length + 1}`,
        requestItemId: null,
        attemptCount: 0,
        version: 1,
        createdAt: new Date(),
        ...data,
      };
      jobs.push(job);
      return job;
    },
    updateMany: async (args) => {
      captured.jobUpdates.push(args);
      const index = jobs.findIndex((job) => job.id === args.where.id
        && job.version === args.where.version
        && job.status === args.where.status);
      if (index < 0) return { count: 0 };
      const data = { ...args.data };
      if (data.attemptCount?.increment) data.attemptCount = jobs[index].attemptCount + data.attemptCount.increment;
      if (data.version?.increment) data.version = jobs[index].version + data.version.increment;
      jobs[index] = { ...jobs[index], ...data };
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }) => {
      const job = jobs.find((candidate) => candidate.id === where.id);
      return {
        ...job,
        results: results
          .filter((result) => result.analysisJobId === job.id)
          .map((result) => ({
            ...result,
            detectedMeasurements: measurements.filter((measurement) => measurement.analysisResultId === result.id),
          })),
      };
    },
    findMany: async () => jobs.map((job) => ({
      ...job,
      results: results
        .filter((result) => result.analysisJobId === job.id)
        .map((result) => ({
          ...result,
          detectedMeasurements: measurements.filter((measurement) => measurement.analysisResultId === result.id),
        })),
    })),
  };
  const resultDelegate = {
    create: async ({ data }) => {
      const result = { ...resultFixture(), id: `result-${results.length + 1}`, ...data };
      results.push(result);
      return result;
    },
    updateMany: async (args) => {
      captured.resultUpdates.push(args);
      const index = results.findIndex((result) => result.id === args.where.id
        && result.version === args.where.version
        && result.reviewStatus === args.where.reviewStatus);
      if (index < 0 || options.resultUpdateCount === 0) return { count: 0 };
      results[index] = {
        ...results[index],
        ...args.data,
        version: results[index].version + 1,
      };
      return { count: 1 };
    },
  };
  const measurementDelegate = {
    createMany: async ({ data }) => {
      data.forEach((entry, index) => measurements.push({ id: `measurement-${measurements.length + index + 1}`, ...entry }));
      return { count: data.length };
    },
    findFirst: async ({ where }) => {
      if (options.measurementRelationshipValid === false) return null;
      const measurement = measurements.find((candidate) => candidate.id === where.id);
      if (!measurement) return null;
      const result = results.find((candidate) => candidate.id === measurement.analysisResultId);
      const job = result && (jobs.find((candidate) => candidate.id === result.analysisJobId) ?? {
        id: result.analysisJobId,
        requestId: 'request-1',
        requestItemId: 'item-1',
        attachmentId: 'attachment-1',
        status: AnalysisJobStatus.COMPLETED,
      });
      return result && job ? { ...measurement, analysisResult: { ...result, analysisJob: job } } : null;
    },
    findMany: async () => measurements,
  };
  const itemDelegate = {
    findFirst: async ({ where }) => items.find((item) => item.id === where.id && item.requestId === where.requestId) ?? null,
    updateMany: async (args) => {
      captured.itemUpdates.push(args);
      const index = items.findIndex((item) => item.id === args.where.id
        && item.requestId === args.where.requestId
        && item.version === args.where.version);
      if (index < 0 || options.itemUpdateCount === 0) return { count: 0 };
      items[index] = { ...items[index], ...args.data, version: items[index].version + 1 };
      return { count: 1 };
    },
    findUniqueOrThrow: async ({ where }) => items.find((item) => item.id === where.id),
  };
  const reviewDelegate = {
    create: async ({ data }) => {
      if (reviews.some((review) => review.analysisResultId === data.analysisResultId
        && review.requestItemId === data.requestItemId)) {
        const error = new Error('duplicate review');
        error.code = 'P2002';
        throw error;
      }
      const review = { id: `review-${reviews.length + 1}`, createdAt: new Date(), ...data };
      reviews.push(review);
      return review;
    },
  };
  const transaction = {
    request: requestDelegate,
    attachment: attachmentDelegate,
    analysisJob: jobDelegate,
    analysisResult: resultDelegate,
    detectedMeasurement: measurementDelegate,
    requestItem: itemDelegate,
    measurementReview: reviewDelegate,
  };
  const prisma = {
    ...transaction,
    quotation: { updateMany: async () => { captured.quotationWrites += 1; } },
    order: { updateMany: async () => { captured.orderWrites += 1; } },
    $transaction: async (operation) => operation(transaction),
  };
  const audit = {
    records: [],
    record: async (payload, client) => {
      audit.records.push({ payload, client });
      return payload;
    },
  };
  const provider = options.provider ?? {
    providerName: 'deterministic',
    modelName: 'measurement-fixture',
    modelVersion: '1.0.0',
    requiresContent: false,
    analyze: async () => {
      captured.providerCalls += 1;
      return {
        confidence: 0.9,
        measurements: [{
          label: 'Panel',
          geometryType: GeometryType.RECTANGLE,
          widthMm: 1200,
          heightMm: 800,
          depthMm: 10,
          thicknessMm: 8,
          quantity: 3,
          unit: MeasurementUnit.PIECE,
          confidence: 0.9,
        }],
      };
    },
  };
  const queue = options.queue ?? {
    enqueue: (jobId) => captured.enqueuedJobIds.push(jobId),
  };
  return {
    service: new AnalysisService(prisma, audit, provider, queue),
    audit,
    captured,
    jobs,
    results,
    measurements,
    reviews,
    items,
    transaction,
  };
}

test('unauthenticated user cannot start analysis', async () => {
  const harness = createHarness();
  await assert.rejects(harness.service.start('request-1', 'attachment-1'), ForbiddenException);
  assert.equal(harness.jobs.length, 0);
});

test('attachment outside tenant scope cannot be analyzed', async () => {
  const harness = createHarness({ request: null });
  await assert.rejects(harness.service.start('request-1', 'attachment-1', actor), NotFoundException);
  assert.equal(harness.jobs.length, 0);
});

for (const status of [
  AttachmentStatus.PENDING_UPLOAD,
  AttachmentStatus.DELETED,
  AttachmentStatus.QUARANTINED,
]) {
  test(`${status} attachment cannot be analyzed`, async () => {
    const harness = createHarness({ attachment: attachmentFixture({ status }) });
    await assert.rejects(harness.service.start('request-1', 'attachment-1', actor), ConflictException);
  });
}

test('AVAILABLE attachment creates and enqueues an analysis job without waiting for provider', async () => {
  const harness = createHarness();
  const response = await harness.service.start('request-1', 'attachment-1', actor);

  assert.equal(harness.jobs[0].status, AnalysisJobStatus.QUEUED);
  assert.equal(response.status, AnalysisJobStatus.QUEUED);
  assert.equal(harness.audit.records[0].payload.action, 'ANALYSIS_STARTED');
  assert.equal(harness.audit.records[0].client, harness.transaction);
  assert.deepEqual(harness.captured.enqueuedJobIds, [harness.jobs[0].id]);
  assert.equal(harness.captured.providerCalls, 0);
});

test('duplicate active job for the attachment is rejected', async () => {
  const harness = createHarness({ jobs: [{
    id: 'active-job', requestId: 'request-1', attachmentId: 'attachment-1', status: AnalysisJobStatus.RUNNING,
  }] });
  await assert.rejects(harness.service.start('request-1', 'attachment-1', actor), ConflictException);
});

test('HTTP start does not persist provider output inside the request', async () => {
  const harness = createHarness();
  await harness.service.start('request-1', 'attachment-1', actor);

  assert.equal(harness.results.length, 0);
  assert.equal(harness.measurements.length, 0);
  assert.equal(harness.captured.providerCalls, 0);
});

test('provider failure cannot leak through the enqueue response', async () => {
  const provider = {
    providerName: 'mock', modelName: 'mock', modelVersion: '1', requiresContent: false,
    analyze: async () => { throw new Error('secret provider detail'); },
  };
  const harness = createHarness({ provider });

  const response = await harness.service.start('request-1', 'attachment-1', actor);
  assert.equal(response.status, AnalysisJobStatus.QUEUED);
  assert.equal(JSON.stringify(response).includes('secret'), false);
  assert.equal(harness.captured.enqueuedJobIds.length, 1);
});

test('analysis list response omits lease, internal failure, and raw provider storage fields', async () => {
  const harness = createHarness({
    jobs: [{
      id: 'job-1',
      requestId: 'request-1',
      attachmentId: 'attachment-1',
      requestItemId: 'item-1',
      status: AnalysisJobStatus.FAILED,
      leaseToken: 'secret-lease',
      failureReason: 'private provider detail',
    }],
    results: [resultFixture({ analysisJobId: 'job-1', rawOutputStorageKey: 'private-output-key' })],
  });

  const response = await harness.service.listByAttachment('request-1', 'attachment-1', actor);
  const serialized = JSON.stringify(response);
  assert.equal(serialized.includes('secret-lease'), false);
  assert.equal(serialized.includes('private provider detail'), false);
  assert.equal(serialized.includes('private-output-key'), false);
});

test('AI suggestions do not mutate canonical RequestItem, Quotation, or Order', async () => {
  const harness = createHarness();
  const before = { ...harness.items[0] };
  await harness.service.start('request-1', 'attachment-1', actor);

  assert.deepEqual(harness.items[0], before);
  assert.equal(harness.captured.itemUpdates.length, 0);
  assert.equal(harness.captured.quotationWrites, 0);
  assert.equal(harness.captured.orderWrites, 0);
});

test('mismatched RequestItem and DetectedMeasurement relationship is rejected', async () => {
  const harness = createHarness({
    results: [resultFixture()],
    measurements: [detectedFixture()],
    measurementRelationshipValid: false,
  });
  await assert.rejects(harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.APPROVE,
    requestItemVersion: 1,
    analysisResultVersion: 1,
  }, actor), BadRequestException);
});

test('APPROVE updates only canonical measurement fields and marks item APPROVED', async () => {
  const harness = createHarness({ results: [resultFixture()], measurements: [detectedFixture()] });
  const response = await harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.APPROVE,
    requestItemVersion: 1,
    analysisResultVersion: 1,
  }, actor);

  assert.equal(response.requestItem.widthMm, 1200);
  assert.equal(response.requestItem.heightMm, 800);
  assert.equal(response.requestItem.measurementStatus, MeasurementStatus.APPROVED);
  assert.equal(response.requestItem.sourceAnalysisResultId, 'result-1');
  assert.equal(response.requestItem.calculatedAreaM2, 0.96);
  assert.equal(response.requestItem.calculatedLengthM, 2.5);
  assert.equal(response.requestItem.calculatedVolumeM3, 0.0096);
  assert.equal(harness.audit.records[0].payload.action, 'MEASUREMENT_REVIEWED');
  assert.equal(harness.audit.records[0].client, harness.transaction);
});

test('REJECT keeps canonical values unchanged and marks item REJECTED', async () => {
  const harness = createHarness({ results: [resultFixture()], measurements: [detectedFixture()] });
  await harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.REJECT,
    requestItemVersion: 1,
    analysisResultVersion: 1,
    reason: 'Incorrect detection',
  }, actor);

  assert.equal(harness.items[0].widthMm, 10);
  assert.equal(harness.items[0].heightMm, 20);
  assert.equal(harness.items[0].calculatedAreaM2, 0.0002);
  assert.equal(harness.items[0].measurementStatus, MeasurementStatus.REJECTED);
});

test('CORRECT recomputes derived values instead of trusting AI calculated totals', async () => {
  const harness = createHarness({
    results: [resultFixture()],
    measurements: [detectedFixture({ calculatedAreaM2: 999, calculatedVolumeM3: 999 })],
  });
  await harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.CORRECT,
    requestItemVersion: 1,
    analysisResultVersion: 1,
    width: 2000,
    height: 1000,
    depth: 20,
  }, actor);

  assert.equal(harness.items[0].calculatedAreaM2, 2);
  assert.equal(harness.items[0].calculatedVolumeM3, 0.04);
  assert.equal(harness.reviews[0].correctedAreaM2, 2);
});

test('wrong RequestItem version produces ConflictException', async () => {
  const harness = createHarness({ results: [resultFixture()], measurements: [detectedFixture()] });
  await assert.rejects(harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.APPROVE,
    requestItemVersion: 9,
    analysisResultVersion: 1,
  }, actor), ConflictException);
});

test('wrong AnalysisResult version produces ConflictException', async () => {
  const harness = createHarness({ results: [resultFixture()], measurements: [detectedFixture()] });
  await assert.rejects(harness.service.review('request-1', 'item-1', {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.APPROVE,
    requestItemVersion: 1,
    analysisResultVersion: 9,
  }, actor), ConflictException);
  assert.equal(harness.captured.itemUpdates.length, 0);
});

test('only one concurrent approval can transition the pending AnalysisResult', async () => {
  const harness = createHarness({ results: [resultFixture()], measurements: [detectedFixture()] });
  const input = {
    detectedMeasurementId: 'measurement-1',
    action: MeasurementReviewAction.APPROVE,
    requestItemVersion: 1,
    analysisResultVersion: 1,
  };
  await harness.service.review('request-1', 'item-1', input, actor);
  await assert.rejects(harness.service.review('request-1', 'item-1', input, actor), ConflictException);
  assert.equal(harness.reviews.length, 1);
});