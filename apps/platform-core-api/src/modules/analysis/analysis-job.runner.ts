import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnalysisJobStatus,
  AnalysisReviewStatus,
  AttachmentStatus,
  CompanyStatus,
  Prisma,
} from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { STORAGE_PORT, StoragePort } from '../storage/storage.contract';
import {
  ANALYSIS_PROVIDER,
  AnalysisProvider,
  AnalysisProviderError,
  SuggestedMeasurement,
} from './analysis-provider.contract';
import { validateProviderResult } from './validate-provider-result';

export type AnalysisJobOutcome = 'COMPLETED' | 'FAILED' | 'REQUEUED' | 'NOT_CLAIMED';

type LoadedJob = NonNullable<Awaited<ReturnType<AnalysisJobRunner['loadJob']>>>;

@Injectable()
export class AnalysisJobRunner {
  private readonly leaseDurationMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(ANALYSIS_PROVIDER) private readonly provider: AnalysisProvider,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    @Optional() configService?: ConfigService,
  ) {
    const requestTimeoutMs = configService?.get<number>('ai.requestTimeoutMs') ?? 30_000;
    this.leaseDurationMs = Math.max(120_000, requestTimeoutMs + 30_000);
  }

  async execute(jobId: string): Promise<AnalysisJobOutcome> {
    const job = await this.loadJob(jobId);
    if (!job || !this.isClaimable(job)) return 'NOT_CLAIMED';

    const queuedVersion = job.version;
    const previousAttemptCount = job.attemptCount;
    const leaseToken = randomUUID();
    const now = new Date();
    const claimed = await this.prisma.analysisJob.updateMany({
      where: {
        id: job.id,
        version: queuedVersion,
        attemptCount: { lt: job.maxAttempts },
        OR: [
          { status: AnalysisJobStatus.QUEUED },
          { status: AnalysisJobStatus.RUNNING, leaseExpiresAt: { lt: now } },
        ],
      },
      data: {
        status: AnalysisJobStatus.RUNNING,
        leaseToken,
        leaseExpiresAt: new Date(now.getTime() + this.leaseDurationMs),
        startedAt: now,
        completedAt: null,
        failureCode: null,
        failureReason: null,
        attemptCount: { increment: 1 },
        version: { increment: 1 },
      },
    });
    if (claimed.count !== 1) return 'NOT_CLAIMED';

    const runningVersion = queuedVersion + 1;
    const attemptCount = previousAttemptCount + 1;
    try {
      this.assertExecutionScope(job);
      this.assertProviderMatches(job);
      const content = this.provider.requiresContent
        ? await this.readAttachment(job)
        : undefined;
      const providerResult = validateProviderResult(await this.provider.analyze({
        attachmentId: job.attachment.id,
        requestItemId: job.requestItemId ?? undefined,
        fileName: job.attachment.fileName,
        mimeType: job.attachment.mimeType,
        sizeBytes: Number(job.attachment.sizeBytes),
        checksum: job.attachment.checksum,
        content,
      }));

      await this.persistSuccess(job, runningVersion, leaseToken, providerResult);
      return 'COMPLETED';
    } catch (error) {
      return this.persistFailure(job, runningVersion, attemptCount, leaseToken, error);
    }
  }

  private loadJob(jobId: string) {
    return this.prisma.analysisJob.findUnique({
      where: { id: jobId },
      include: {
        request: {
          select: {
            id: true,
            companyId: true,
            company: { select: { id: true, status: true } },
          },
        },
        requestItem: { select: { id: true, requestId: true } },
        attachment: true,
      },
    });
  }

  private isClaimable(job: {
    status: AnalysisJobStatus;
    attemptCount: number;
    maxAttempts: number;
    leaseExpiresAt: Date | null;
  }): boolean {
    if (job.attemptCount >= job.maxAttempts) return false;
    if (job.status === AnalysisJobStatus.QUEUED) return true;
    return job.status === AnalysisJobStatus.RUNNING
      && job.leaseExpiresAt !== null
      && job.leaseExpiresAt.getTime() < Date.now();
  }

  private assertExecutionScope(job: LoadedJob): void {
    const requestItemMatches = job.requestItemId === null
      ? job.requestItem === null && job.attachment.requestItemId === null
      : job.requestItem?.id === job.requestItemId
        && job.requestItem.requestId === job.requestId
        && job.attachment.requestItemId === job.requestItemId;
    if (job.request.id !== job.requestId
      || job.request.company.id !== job.request.companyId
      || job.request.company.status !== CompanyStatus.ACTIVE
      || job.attachment.id !== job.attachmentId
      || job.attachment.requestId !== job.requestId
      || !requestItemMatches) {
      throw new AnalysisProviderError('SCOPE_INVALID', 'Analysis job relationships are invalid', false);
    }
    if (job.attachment.status !== AttachmentStatus.AVAILABLE) {
      throw new AnalysisProviderError('ATTACHMENT_UNAVAILABLE', 'Attachment is not available', false);
    }
  }

  private assertProviderMatches(job: LoadedJob): void {
    if (job.provider !== this.provider.providerName
      || job.model !== this.provider.modelName
      || job.modelVersion !== this.provider.modelVersion) {
      throw new AnalysisProviderError('PROVIDER_MISMATCH', 'Configured analysis provider does not match the job', false);
    }
  }

  private async readAttachment(job: LoadedJob): Promise<Buffer> {
    try {
      const object = await this.storage.readObject({
        storageKey: job.attachment.storageKey,
        expectedMimeType: job.attachment.mimeType,
        expectedSizeBytes: Number(job.attachment.sizeBytes),
      });
      return object.content;
    } catch {
      throw new AnalysisProviderError(
        'ATTACHMENT_READ_FAILED',
        'Attachment content could not be read',
        false,
      );
    }
  }

  private async persistSuccess(
    job: LoadedJob,
    runningVersion: number,
    leaseToken: string,
    providerResult: ReturnType<typeof validateProviderResult>,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.analysisResult.create({
        data: {
          analysisJobId: job.id,
          resultVersion: 1,
          schemaVersion: 1,
          provider: this.provider.providerName,
          model: this.provider.modelName,
          modelVersion: this.provider.modelVersion,
          confidence: providerResult.confidence,
          warnings: providerResult.warnings,
          assumptions: providerResult.assumptions,
          reviewStatus: AnalysisReviewStatus.PENDING,
        },
      });
      await transaction.detectedMeasurement.createMany({
        data: providerResult.measurements.map((measurement, index) => ({
          analysisResultId: result.id,
          ordinal: index + 1,
          ...this.detectedMeasurementData(measurement),
        })),
      });
      const completed = await transaction.analysisJob.updateMany({
        where: {
          id: job.id,
          version: runningVersion,
          status: AnalysisJobStatus.RUNNING,
          leaseToken,
        },
        data: {
          status: AnalysisJobStatus.COMPLETED,
          completedAt: new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (completed.count !== 1) {
        throw new AnalysisProviderError('STALE_VERSION', 'Analysis job changed during execution', false);
      }
      await this.auditService.record({
        action: 'ANALYSIS_COMPLETED',
        resource: 'analysis_job',
        resourceId: job.id,
        metadata: this.auditMetadata(job, runningVersion + 1, AnalysisJobStatus.COMPLETED),
      }, transaction);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  private async persistFailure(
    job: LoadedJob,
    runningVersion: number,
    attemptCount: number,
    leaseToken: string,
    error: unknown,
  ): Promise<AnalysisJobOutcome> {
    const failure = error instanceof AnalysisProviderError
      ? error
      : new AnalysisProviderError('EXECUTION_FAILED', 'Analysis execution failed', false);
    const retry = failure.transient && attemptCount < job.maxAttempts;
    const status = retry ? AnalysisJobStatus.QUEUED : AnalysisJobStatus.FAILED;
    const action = retry ? 'ANALYSIS_RETRY_QUEUED' : 'ANALYSIS_FAILED';
    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.analysisJob.updateMany({
        where: {
          id: job.id,
          version: runningVersion,
          status: AnalysisJobStatus.RUNNING,
          leaseToken,
        },
        data: {
          status,
          failureCode: failure.code,
          failureReason: failure.message,
          completedAt: retry ? null : new Date(),
          leaseToken: null,
          leaseExpiresAt: null,
          version: { increment: 1 },
        },
      });
      if (result.count !== 1) return false;
      await this.auditService.record({
        action,
        resource: 'analysis_job',
        resourceId: job.id,
        metadata: this.auditMetadata(job, runningVersion + 1, status, failure.code),
      }, transaction);
      return true;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (!updated) return 'NOT_CLAIMED';
    return retry ? 'REQUEUED' : 'FAILED';
  }

  private detectedMeasurementData(measurement: SuggestedMeasurement) {
    const calculatedAreaM2 = measurement.widthMm !== undefined && measurement.heightMm !== undefined
      ? this.roundSix(measurement.widthMm * measurement.heightMm / 1_000_000)
      : undefined;
    const calculatedLengthM = measurement.lengthMm !== undefined
      ? this.roundSix(measurement.lengthMm / 1000)
      : undefined;
    const calculatedVolumeM3 = measurement.widthMm !== undefined
      && measurement.heightMm !== undefined
      && measurement.depthMm !== undefined
      ? this.roundSix(measurement.widthMm * measurement.heightMm * measurement.depthMm / 1_000_000_000)
      : undefined;
    return {
      label: measurement.label,
      geometryType: measurement.geometryType,
      widthMm: measurement.widthMm,
      heightMm: measurement.heightMm,
      lengthMm: measurement.lengthMm,
      depthMm: measurement.depthMm,
      thicknessMm: measurement.thicknessMm,
      quantity: measurement.quantity,
      unit: measurement.unit,
      calculatedAreaM2,
      calculatedLengthM,
      calculatedVolumeM3,
      confidence: measurement.confidence,
      warnings: measurement.warnings,
      assumptions: measurement.assumptions,
    };
  }

  private auditMetadata(
    job: LoadedJob,
    version: number,
    status: AnalysisJobStatus,
    failureCode?: string,
  ) {
    return {
      requestId: job.requestId,
      attachmentId: job.attachmentId,
      analysisJobId: job.id,
      requestItemId: job.requestItemId,
      version,
      status,
      ...(failureCode ? { failureCode } : {}),
    };
  }

  private roundSix(value: number): number {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  }
}