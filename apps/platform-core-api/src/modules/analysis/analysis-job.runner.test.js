const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const {
  AnalysisJobStatus,
  AnalysisReviewStatus,
  AttachmentStatus,
  CompanyStatus,
  GeometryType,
  MeasurementUnit,
} = require('@prisma/client');
const { AnalysisProviderError } = require('./analysis-provider.contract.ts');
const { AnalysisJobRunner } = require('./analysis-job.runner.ts');

function jobFixture(overrides = {}) {
  const request = {
    id: 'request-1',
    companyId: 'company-1',
    company: { id: 'company-1', status: CompanyStatus.ACTIVE },
  };
  const requestItem = { id: 'item-1', requestId: request.id };
  const attachment = {
    id: 'attachment-1',
    requestId: request.id,
    requestItemId: requestItem.id,
    fileName: 'drawing.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4n,
    checksum: 'verified-checksum',
    storageKey: 'private-storage-key',
    status: AttachmentStatus.AVAILABLE,
  };
  return {
    id: 'job-1',
    requestId: request.id,
    requestItemId: requestItem.id,
    attachmentId: attachment.id,
    status: AnalysisJobStatus.QUEUED,
    provider: 'mock',
    model: 'mock-model',
    modelVersion: '1',
    attemptCount: 0,
    maxAttempts: 3,
    leaseToken: null,
    leaseExpiresAt: null,
    version: 1,
    request,
    requestItem,
    attachment,
    ...overrides,
  };
}

function providerResult() {
  return {
    confidence: 0.9,
    warnings: [],
    assumptions: [],
    measurements: [{
      label: 'Panel',
      geometryType: GeometryType.RECTANGLE,
      widthMm: 1200,
      heightMm: 800,
      quantity: 1,
      unit: MeasurementUnit.PIECE,
      confidence: 0.9,
    }],
  };
}

function createHarness(options = {}) {
  const job = options.job ?? jobFixture();
  const results = [];
  const measurements = [];
  const captured = {
    claims: 0,
    providerCalls: 0,
    storageInputs: [],
    itemWrites: 0,
    quotationWrites: 0,
    orderWrites: 0,
  };
  const audit = {
    records: [],
    record: async (payload, client) => audit.records.push({ payload, client }),
  };
  const jobDelegate = {
    findUnique: async () => job,
    updateMany: async ({ where, data }) => {
      const claim = data.status === AnalysisJobStatus.RUNNING;
      if (claim) {
        const staleRunning = job.status === AnalysisJobStatus.RUNNING
          && job.leaseExpiresAt
          && job.leaseExpiresAt.getTime() < Date.now();
        if ((job.status !== AnalysisJobStatus.QUEUED && !staleRunning)
          || job.version !== where.version) return { count: 0 };
        captured.claims += 1;
      } else if (job.status !== AnalysisJobStatus.RUNNING
        || job.version !== where.version
        || (where.leaseToken && job.leaseToken !== where.leaseToken)) {
        return { count: 0 };
      }
      if (data.attemptCount?.increment) job.attemptCount += data.attemptCount.increment;
      if (data.version?.increment) job.version += data.version.increment;
      Object.assign(job, data, { attemptCount: job.attemptCount, version: job.version });
      return { count: 1 };
    },
    findUniqueOrThrow: async () => ({
      ...job,
      results: results.map((result) => ({
        ...result,
        detectedMeasurements: measurements.filter((entry) => entry.analysisResultId === result.id),
      })),
    }),
  };
  const transaction = {
    analysisJob: jobDelegate,
    analysisResult: {
      create: async ({ data }) => {
        const result = { id: `result-${results.length + 1}`, version: 1, ...data };
        results.push(result);
        return result;
      },
    },
    detectedMeasurement: {
      createMany: async ({ data }) => {
        measurements.push(...data);
        return { count: data.length };
      },
    },
    requestItem: { updateMany: async () => { captured.itemWrites += 1; } },
    quotation: { updateMany: async () => { captured.quotationWrites += 1; } },
    order: { updateMany: async () => { captured.orderWrites += 1; } },
  };
  const prisma = {
    analysisJob: jobDelegate,
    $transaction: async (operation) => operation(transaction),
  };
  const provider = options.provider ?? {
    providerName: 'mock',
    modelName: 'mock-model',
    modelVersion: '1',
    requiresContent: true,
    analyze: async () => {
      captured.providerCalls += 1;
      return providerResult();
    },
  };
  const storage = options.storage ?? {
    readObject: async (storageInput) => {
      captured.storageInputs.push(storageInput);
      return { content: Buffer.from('%PDF'), mimeType: 'application/pdf', sizeBytes: 4 };
    },
  };
  return {
    runner: new AnalysisJobRunner(prisma, audit, provider, storage),
    job,
    results,
    measurements,
    captured,
    audit,
    transaction,
  };
}

test('successful execution claims once and persists result, measurements, and COMPLETED atomically', async () => {
  const harness = createHarness();
  const outcome = await harness.runner.execute('job-1');

  assert.equal(outcome, 'COMPLETED');
  assert.equal(harness.captured.claims, 1);
  assert.equal(harness.job.status, AnalysisJobStatus.COMPLETED);
  assert.equal(harness.results.length, 1);
  assert.equal(harness.results[0].reviewStatus, AnalysisReviewStatus.PENDING);
  assert.equal(harness.measurements.length, 1);
  assert.equal(harness.audit.records.at(-1).payload.action, 'ANALYSIS_COMPLETED');
  assert.equal(harness.audit.records.at(-1).client, harness.transaction);
});

test('worker sends content without exposing storage key to provider', async () => {
  let providerInput;
  const provider = {
    providerName: 'mock', modelName: 'mock-model', modelVersion: '1', requiresContent: true,
    analyze: async (input) => { providerInput = input; return providerResult(); },
  };
  const harness = createHarness({ provider });
  await harness.runner.execute('job-1');

  assert.deepEqual(harness.captured.storageInputs, [{
    storageKey: 'private-storage-key',
    expectedMimeType: 'application/pdf',
    expectedSizeBytes: 4,
  }]);
  assert.equal(providerInput.content.toString(), '%PDF');
  assert.equal(Object.hasOwn(providerInput, 'storageKey'), false);
});

test('a second worker cannot claim the same job', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const provider = {
    providerName: 'mock', modelName: 'mock-model', modelVersion: '1', requiresContent: false,
    analyze: async () => { await gate; return providerResult(); },
  };
  const harness = createHarness({ provider });
  const first = harness.runner.execute('job-1');
  await new Promise((resolve) => setImmediate(resolve));
  const second = await harness.runner.execute('job-1');
  release();

  assert.equal(second, 'NOT_CLAIMED');
  assert.equal(await first, 'COMPLETED');
  assert.equal(harness.captured.claims, 1);
});

for (const status of [AnalysisJobStatus.COMPLETED, AnalysisJobStatus.FAILED, AnalysisJobStatus.RUNNING]) {
  test(`${status} job is not executed again`, async () => {
    const harness = createHarness({ job: jobFixture({ status }) });
    assert.equal(await harness.runner.execute('job-1'), 'NOT_CLAIMED');
    assert.equal(harness.captured.providerCalls, 0);
  });
}

test('expired RUNNING lease can be reclaimed safely', async () => {
  const harness = createHarness({ job: jobFixture({
    status: AnalysisJobStatus.RUNNING,
    leaseToken: 'expired-lease',
    leaseExpiresAt: new Date(Date.now() - 1000),
  }) });
  assert.equal(await harness.runner.execute('job-1'), 'COMPLETED');
  assert.equal(harness.captured.claims, 1);
  assert.equal(harness.job.attemptCount, 1);
});

test('invalid tenant/request/item/attachment relationship fails before provider execution', async () => {
  const harness = createHarness({
    job: jobFixture({ requestItem: { id: 'item-1', requestId: 'another-request' } }),
  });
  assert.equal(await harness.runner.execute('job-1'), 'FAILED');
  assert.equal(harness.job.failureCode, 'SCOPE_INVALID');
  assert.equal(harness.captured.providerCalls, 0);
});

for (const status of [AttachmentStatus.QUARANTINED, AttachmentStatus.DELETED, AttachmentStatus.PENDING_UPLOAD]) {
  test(`${status} attachment fails before provider execution`, async () => {
    const base = jobFixture();
    const harness = createHarness({ job: { ...base, attachment: { ...base.attachment, status } } });
    assert.equal(await harness.runner.execute('job-1'), 'FAILED');
    assert.equal(harness.job.failureCode, 'ATTACHMENT_UNAVAILABLE');
    assert.equal(harness.captured.providerCalls, 0);
  });
}

for (const [code, transient, maxAttempts, outcome] of [
  ['TIMEOUT', true, 1, 'FAILED'],
  ['HTTP_400', false, 3, 'FAILED'],
  ['HTTP_500', true, 3, 'REQUEUED'],
  ['INVALID_RESPONSE', false, 3, 'FAILED'],
]) {
  test(`${code} produces ${outcome}`, async () => {
    const provider = {
      providerName: 'mock', modelName: 'mock-model', modelVersion: '1', requiresContent: false,
      analyze: async () => { throw new AnalysisProviderError(code, 'Safe provider failure', transient); },
    };
    const harness = createHarness({ job: jobFixture({ maxAttempts }), provider });
    assert.equal(await harness.runner.execute('job-1'), outcome);
    assert.equal(harness.job.status, outcome === 'REQUEUED' ? AnalysisJobStatus.QUEUED : AnalysisJobStatus.FAILED);
    assert.equal(harness.job.failureReason.includes('Safe'), true);
    assert.equal(harness.audit.records.at(-1).payload.action, outcome === 'REQUEUED' ? 'ANALYSIS_RETRY_QUEUED' : 'ANALYSIS_FAILED');
  });
}

test('unreadable attachment fails safely', async () => {
  const harness = createHarness({ storage: { readObject: async () => { throw new Error('private path'); } } });
  assert.equal(await harness.runner.execute('job-1'), 'FAILED');
  assert.equal(harness.job.failureCode, 'ATTACHMENT_READ_FAILED');
  assert.equal(harness.job.failureReason.includes('private path'), false);
});

test('worker never mutates canonical RequestItem, Quotation, or Order', async () => {
  const harness = createHarness();
  await harness.runner.execute('job-1');
  assert.equal(harness.captured.itemWrites, 0);
  assert.equal(harness.captured.quotationWrites, 0);
  assert.equal(harness.captured.orderWrites, 0);
});

test('job with a mismatched tenant company is not processed', async () => {
  const base = jobFixture();
  const harness = createHarness({
    job: {
      ...base,
      request: { ...base.request, company: { id: 'another-company', status: CompanyStatus.ACTIVE } },
    },
  });
  assert.equal(await harness.runner.execute('job-1'), 'FAILED');
  assert.equal(harness.job.failureCode, 'SCOPE_INVALID');
  assert.equal(harness.captured.providerCalls, 0);
});