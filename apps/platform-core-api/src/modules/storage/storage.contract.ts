import { Readable } from 'node:stream';

export const STORAGE_PORT = Symbol('STORAGE_PORT');

export type InitiateUploadInput = {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
};

export type InitiateUploadResult = {
  provider: string;
  uploadUrl: string;
  expiresAt: Date;
};

export type CompleteUploadInput = {
  storageKey: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
};

export type CompleteUploadResult = {
  checksum: string;
  detectedMimeType: string;
  sizeBytes: number;
};

export type DownloadUrlInput = {
  storageKey: string;
  fileName: string;
  mimeType: string;
};

export type DownloadObject = {
  stream: Readable;
  fileName: string;
  mimeType: string;
};

export type ReadObjectInput = {
  storageKey: string;
  expectedMimeType: string;
  expectedSizeBytes: number;
};

export type ReadObjectResult = {
  content: Buffer;
  mimeType: string;
  sizeBytes: number;
};

export interface StoragePort {
  initiateUpload(input: InitiateUploadInput): Promise<InitiateUploadResult>;
  acceptUpload(
    uploadToken: string,
    body: Readable,
    contentLength?: number,
    contentType?: string,
  ): Promise<void>;
  completeUpload(input: CompleteUploadInput): Promise<CompleteUploadResult>;
  getDownloadUrl(input: DownloadUrlInput): Promise<{ url: string; expiresAt: Date }>;
  openDownload(downloadToken: string): Promise<DownloadObject>;
  readObject(input: ReadObjectInput): Promise<ReadObjectResult>;
  deleteObject(storageKey: string): Promise<void>;
}

export class StorageValidationError extends Error {}
export class StorageNotFoundError extends Error {}