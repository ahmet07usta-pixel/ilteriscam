const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { Readable } = require('node:stream');
require('ts-node/register/transpile-only');

const { LocalStorageAdapter } = require('./local-storage.adapter.ts');

function configFor(rootPath) {
  return {
    getOrThrow(key) {
      if (key === 'storage.rootPath') return rootPath;
      if (key === 'storage.signedUrlTtlSeconds') return 300;
      if (key === 'app.apiPrefix') return 'api/v1';
      throw new Error(`Unexpected config key: ${key}`);
    },
  };
}

test('local adapter uploads, verifies, signs, streams, and deletes inside a temporary root', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'dijital-cam-storage-test-'));
  const adapter = new LocalStorageAdapter(configFor(rootPath));
  const storageKey = 'a'.repeat(32);
  const content = Buffer.from('%PDF-1.4\nlocal adapter test');

  try {
    const initiation = await adapter.initiateUpload({
      storageKey,
      mimeType: 'application/pdf',
      sizeBytes: content.length,
    });
    const uploadToken = initiation.uploadUrl.split('/').at(-1);
    await adapter.acceptUpload(
      uploadToken,
      Readable.from(content),
      content.length,
      'application/pdf',
    );

    const completed = await adapter.completeUpload({
      storageKey,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: content.length,
    });
    assert.equal(completed.detectedMimeType, 'application/pdf');
    assert.equal(completed.sizeBytes, content.length);
    assert.equal(completed.checksum, createHash('sha256').update(content).digest('hex'));

    const object = await adapter.readObject({
      storageKey,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: content.length,
    });
    assert.deepEqual(object.content, content);
    assert.equal(object.mimeType, 'application/pdf');
    assert.equal(object.sizeBytes, content.length);

    const signed = await adapter.getDownloadUrl({
      storageKey,
      fileName: 'drawing.pdf',
      mimeType: 'application/pdf',
    });
    const downloadToken = signed.url.split('/').at(-1);
    const download = await adapter.openDownload(downloadToken);
    const chunks = [];
    for await (const chunk of download.stream) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), content);

    await adapter.deleteObject(storageKey);
    await assert.rejects(adapter.completeUpload({
      storageKey,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: content.length,
    }));
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test('upload capability is bound to one server-selected object and can be consumed only once', async () => {
  const rootPath = await mkdtemp(join(tmpdir(), 'dijital-cam-storage-capability-test-'));
  const adapter = new LocalStorageAdapter(configFor(rootPath));
  const firstKey = 'a'.repeat(32);
  const secondKey = 'b'.repeat(32);
  const content = Buffer.from('%PDF-1.4\nbound capability');

  try {
    const initiation = await adapter.initiateUpload({
      storageKey: firstKey,
      mimeType: 'application/pdf',
      sizeBytes: content.length,
    });
    const uploadToken = initiation.uploadUrl.split('/').at(-1);
    await adapter.acceptUpload(uploadToken, Readable.from(content), content.length, 'application/pdf');

    await adapter.completeUpload({
      storageKey: firstKey,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: content.length,
    });
    await assert.rejects(adapter.completeUpload({
      storageKey: secondKey,
      expectedMimeType: 'application/pdf',
      expectedSizeBytes: content.length,
    }));
    await assert.rejects(
      adapter.acceptUpload(uploadToken, Readable.from(content), content.length, 'application/pdf'),
    );
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});