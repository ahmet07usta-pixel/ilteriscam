import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  CompleteUploadInput,
  CompleteUploadResult,
  DownloadObject,
  DownloadUrlInput,
  InitiateUploadInput,
  InitiateUploadResult,
  ReadObjectInput,
  ReadObjectResult,
  StorageNotFoundError,
  StoragePort,
  StorageValidationError,
} from './storage.contract';

type PendingUpload = InitiateUploadInput & { expiresAt: Date };
type PendingDownload = DownloadUrlInput & { expiresAt: Date };

@Injectable()
export class LocalStorageAdapter implements StoragePort {
  private readonly rootPath: string;
  private readonly apiPrefix: string;
  private readonly signedUrlTtlSeconds: number;
  private readonly pendingUploads = new Map<string, PendingUpload>();
  private readonly pendingDownloads = new Map<string, PendingDownload>();

  constructor(configService: ConfigService) {
    this.rootPath = configService.getOrThrow<string>('storage.rootPath');
    this.apiPrefix = configService.getOrThrow<string>('app.apiPrefix').replace(/^\/+|\/+$/g, '');
    this.signedUrlTtlSeconds = configService.getOrThrow<number>('storage.signedUrlTtlSeconds');
  }

  async initiateUpload(input: InitiateUploadInput): Promise<InitiateUploadResult> {
    await mkdir(this.objectRoot, { recursive: true });
    const uploadToken = randomUUID();
    const expiresAt = this.expirationDate();
    this.pendingUploads.set(uploadToken, { ...input, expiresAt });

    return {
      provider: 'local',
      uploadUrl: `/${this.apiPrefix}/storage/uploads/${uploadToken}`,
      expiresAt,
    };
  }

  async acceptUpload(
    uploadToken: string,
    body: Readable,
    contentLength?: number,
    contentType?: string,
  ): Promise<void> {
    const pending = this.getValidCapability(this.pendingUploads, uploadToken);
    if (contentLength !== undefined && contentLength !== pending.sizeBytes) {
      throw new StorageValidationError('Uploaded size does not match the initiated upload');
    }
    if (contentType && contentType.split(';', 1)[0].trim().toLowerCase() !== pending.mimeType) {
      throw new StorageValidationError('Uploaded content type does not match the initiated upload');
    }

    const temporaryPath = join(this.rootPath, `.upload-${uploadToken}`);
    let receivedBytes = 0;
    const limiter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        receivedBytes += chunk.length;
        if (receivedBytes > pending.sizeBytes) {
          callback(new StorageValidationError('Uploaded object exceeds the initiated size'));
          return;
        }
        callback(null, chunk);
      },
    });

    try {
      await pipeline(body, limiter, createWriteStream(temporaryPath, { flags: 'wx' }));
      if (receivedBytes !== pending.sizeBytes) {
        throw new StorageValidationError('Uploaded size does not match the initiated upload');
      }
      await rename(temporaryPath, this.objectPath(pending.storageKey));
      this.pendingUploads.delete(uploadToken);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }

  async completeUpload(input: CompleteUploadInput): Promise<CompleteUploadResult> {
    const objectPath = this.objectPath(input.storageKey);
    let objectStat;
    try {
      objectStat = await stat(objectPath);
    } catch (error) {
      if (this.isMissingFile(error)) {
        throw new StorageNotFoundError('Uploaded object was not found');
      }
      throw error;
    }

    if (objectStat.size !== input.expectedSizeBytes) {
      throw new StorageValidationError('Stored object size does not match upload metadata');
    }

    const detectedMimeType = await this.detectMimeType(objectPath);
    if (detectedMimeType !== input.expectedMimeType) {
      throw new StorageValidationError('Stored object content does not match the declared MIME type');
    }

    const hash = createHash('sha256');
    for await (const chunk of createReadStream(objectPath)) {
      hash.update(chunk);
    }

    return {
      checksum: hash.digest('hex'),
      detectedMimeType,
      sizeBytes: objectStat.size,
    };
  }

  async getDownloadUrl(input: DownloadUrlInput): Promise<{ url: string; expiresAt: Date }> {
    try {
      await stat(this.objectPath(input.storageKey));
    } catch (error) {
      if (this.isMissingFile(error)) {
        throw new StorageNotFoundError('Stored object was not found');
      }
      throw error;
    }

    const downloadToken = randomUUID();
    const expiresAt = this.expirationDate();
    this.pendingDownloads.set(downloadToken, { ...input, expiresAt });
    return {
      url: `/${this.apiPrefix}/storage/downloads/${downloadToken}`,
      expiresAt,
    };
  }

  async openDownload(downloadToken: string): Promise<DownloadObject> {
    const pending = this.getValidCapability(this.pendingDownloads, downloadToken);
    this.pendingDownloads.delete(downloadToken);

    try {
      await stat(this.objectPath(pending.storageKey));
    } catch (error) {
      if (this.isMissingFile(error)) {
        throw new StorageNotFoundError('Stored object was not found');
      }
      throw error;
    }

    return {
      stream: createReadStream(this.objectPath(pending.storageKey)),
      fileName: pending.fileName,
      mimeType: pending.mimeType,
    };
  }

  async readObject(input: ReadObjectInput): Promise<ReadObjectResult> {
    const objectPath = this.objectPath(input.storageKey);
    let objectStat;
    try {
      objectStat = await stat(objectPath);
    } catch (error) {
      if (this.isMissingFile(error)) {
        throw new StorageNotFoundError('Stored object was not found');
      }
      throw error;
    }
    if (objectStat.size !== input.expectedSizeBytes) {
      throw new StorageValidationError('Stored object size does not match attachment metadata');
    }
    const detectedMimeType = await this.detectMimeType(objectPath);
    if (detectedMimeType !== input.expectedMimeType) {
      throw new StorageValidationError('Stored object content does not match attachment metadata');
    }
    return {
      content: await readFile(objectPath),
      mimeType: detectedMimeType,
      sizeBytes: objectStat.size,
    };
  }

  async deleteObject(storageKey: string): Promise<void> {
    for (const [token, pending] of this.pendingUploads.entries()) {
      if (pending.storageKey === storageKey) {
        this.pendingUploads.delete(token);
      }
    }
    for (const [token, pending] of this.pendingDownloads.entries()) {
      if (pending.storageKey === storageKey) {
        this.pendingDownloads.delete(token);
      }
    }

    try {
      await unlink(this.objectPath(storageKey));
    } catch (error) {
      if (!this.isMissingFile(error)) {
        throw error;
      }
    }
  }

  private get objectRoot(): string {
    return join(this.rootPath, 'objects');
  }

  private objectPath(storageKey: string): string {
    if (!/^[a-f0-9]{32}$/.test(storageKey)) {
      throw new StorageValidationError('Invalid storage key');
    }
    return join(this.objectRoot, storageKey);
  }

  private expirationDate(): Date {
    return new Date(Date.now() + this.signedUrlTtlSeconds * 1000);
  }

  private getValidCapability<T extends { expiresAt: Date }>(capabilities: Map<string, T>, token: string): T {
    const capability = capabilities.get(token);
    if (!capability || capability.expiresAt.getTime() <= Date.now()) {
      capabilities.delete(token);
      throw new StorageNotFoundError('Storage capability is invalid or expired');
    }
    return capability;
  }

  private async detectMimeType(objectPath: string): Promise<string> {
    const file = await open(objectPath, 'r');
    try {
      const header = Buffer.alloc(16);
      const { bytesRead } = await file.read(header, 0, header.length, 0);
      const bytes = header.subarray(0, bytesRead);

      if (bytes.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
      if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
      }
      if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return 'image/jpeg';
      }
      throw new StorageValidationError('Stored object type is not supported');
    } finally {
      await file.close();
    }
  }

  private isMissingFile(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
  }
}