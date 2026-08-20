const test = require('node:test');
const assert = require('node:assert/strict');
require('ts-node/register/transpile-only');

const { GeometryType, MeasurementUnit } = require('@prisma/client');
const { validateEnv } = require('../../config/env.validation.ts');
const { DeterministicAnalysisProvider } = require('./deterministic-analysis.provider.ts');
const {
  AnalysisProviderError,
  OpenAiAnalysisProvider,
} = require('./openai-analysis.provider.ts');

function config(values = {}) {
  const defaults = {
    'ai.apiKey': 'top-secret-key',
    'ai.model': 'gpt-test',
    'ai.requestTimeoutMs': 1000,
  };
  return { getOrThrow: (key) => values[key] ?? defaults[key] };
}

function input(overrides = {}) {
  return {
    attachmentId: 'attachment-1',
    requestItemId: 'item-1',
    fileName: 'drawing.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 4,
    checksum: 'verified-checksum',
    content: Buffer.from('%PDF'),
    ...overrides,
  };
}

function successfulResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ output_text: JSON.stringify(payload) }),
  };
}

test('deterministic provider keeps deterministic development behavior', async () => {
  const provider = new DeterministicAnalysisProvider();
  const first = await provider.analyze(input({ content: undefined }));
  const second = await provider.analyze(input({ content: undefined }));
  assert.deepEqual(first, second);
  assert.equal(first.measurements.length, 1);
});

test('real provider sends safe content payload and never serializes API key or scope identifiers', async () => {
  let request;
  const httpClient = async (url, init) => {
    request = { url, init };
    return successfulResponse({
      confidence: 0.91,
      warnings: [],
      assumptions: ['Scale inferred'],
      measurements: [{
        label: 'Panel',
        geometryType: GeometryType.RECTANGLE,
        widthMm: 1200,
        heightMm: 800,
        quantity: 1,
        unit: MeasurementUnit.PIECE,
        confidence: 0.9,
      }],
    });
  };
  const provider = new OpenAiAnalysisProvider(config(), httpClient);
  const result = await provider.analyze(input());
  const body = String(request.init.body);

  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.init.headers.Authorization, 'Bearer top-secret-key');
  assert.equal(body.includes('top-secret-key'), false);
  assert.equal(body.includes('attachment-1'), false);
  assert.equal(body.includes('item-1'), false);
  assert.equal(body.includes('storageKey'), false);
  assert.equal(JSON.stringify(result).includes('top-secret-key'), false);
  assert.equal(result.measurements[0].widthMm, 1200);
});

test('provider timeout is classified as safe transient failure', async () => {
  const httpClient = async () => {
    const error = new Error('provider socket details');
    error.name = 'AbortError';
    throw error;
  };
  const provider = new OpenAiAnalysisProvider(config(), httpClient);
  await assert.rejects(provider.analyze(input()), (error) => (
    error instanceof AnalysisProviderError
    && error.code === 'TIMEOUT'
    && error.transient === true
    && !error.message.includes('socket')
  ));
});

for (const [status, transient] of [[400, false], [500, true]]) {
  test(`provider ${status} is classified without exposing response body`, async () => {
    const httpClient = async () => ({
      ok: false,
      status,
      json: async () => ({ error: { message: 'sensitive upstream response' } }),
    });
    const provider = new OpenAiAnalysisProvider(config(), httpClient);
    await assert.rejects(provider.analyze(input()), (error) => (
      error instanceof AnalysisProviderError
      && error.code === `HTTP_${status}`
      && error.transient === transient
      && !error.message.includes('sensitive')
    ));
  });
}

test('invalid provider JSON is rejected before persistence', async () => {
  const provider = new OpenAiAnalysisProvider(
    config(),
    async () => successfulResponse({ measurements: [{ widthMm: 'not-a-number' }] }),
  );
  await assert.rejects(provider.analyze(input()), (error) => (
    error instanceof AnalysisProviderError
    && error.code === 'INVALID_RESPONSE'
    && error.transient === false
  ));
});

test('openai configuration requires an API key while deterministic mode does not', () => {
  const base = {
    NODE_ENV: 'test',
    PORT: 4000,
    API_PREFIX: 'api/v1',
    FRONTEND_ORIGIN: 'http://127.0.0.1:4176',
    DATABASE_URL: 'postgresql://unused',
    REDIS_URL: 'redis://127.0.0.1:6379',
    JWT_ACCESS_SECRET: 'test-access',
    JWT_REFRESH_SECRET: 'test-refresh',
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    COOKIE_SECURE: 'false',
  };
  assert.doesNotThrow(() => validateEnv({ ...base, AI_PROVIDER: 'deterministic' }));
  assert.throws(() => validateEnv({ ...base, AI_PROVIDER: 'openai' }));
  assert.doesNotThrow(() => validateEnv({
    ...base,
    AI_PROVIDER: 'openai',
    AI_API_KEY: 'configured-secret',
  }));
});

test('nullable provider fields are normalized instead of becoming canonical zero values', async () => {
  const provider = new OpenAiAnalysisProvider(
    config(),
    async () => successfulResponse({
      confidence: null,
      warnings: null,
      assumptions: null,
      measurements: [{
        label: null,
        geometryType: GeometryType.COUNT,
        widthMm: null,
        heightMm: null,
        lengthMm: null,
        depthMm: null,
        thicknessMm: null,
        quantity: 1,
        unit: MeasurementUnit.PIECE,
        confidence: null,
        warnings: null,
        assumptions: null,
      }],
    }),
  );
  const result = await provider.analyze(input());
  assert.equal(result.confidence, undefined);
  assert.equal(result.measurements[0].widthMm, undefined);
  assert.equal(result.measurements[0].quantity, 1);
});