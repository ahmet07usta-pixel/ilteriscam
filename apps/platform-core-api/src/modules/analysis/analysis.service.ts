import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnalysisJobStatus,
  AnalysisReviewStatus,
  AnalysisTaskType,
  AttachmentStatus,
  CompanyMembershipStatus,
  MeasurementReviewAction,
  MeasurementSource,
  MeasurementStatus,
  Prisma,
  RequestStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../rbac/permissions';
import {
  ANALYSIS_PROVIDER,
  AnalysisProvider,
} from './analysis-provider.contract';
import { ANALYSIS_JOB_QUEUE, AnalysisJobQueue } from './analysis-job.queue';
import { ReviewMeasurementDto } from './dto/review-measurement.dto';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    @Inject(ANALYSIS_PROVIDER) private readonly provider: AnalysisProvider,
    @Inject(ANALYSIS_JOB_QUEUE) private readonly jobQueue: AnalysisJobQueue,
  ) {}

  async start(requestId: string, attachmentId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getOwnedRequest(requestId, authenticatedActor);
    const attachment = await this.getAttachment(requestId, attachmentId);
    if (attachment.status !== AttachmentStatus.AVAILABLE) {
      throw new ConflictException('Only available attachments can be analyzed');
    }

    const idempotencyKey = this.createIdempotencyKey(attachment.id, attachment.checksum);
    const activeJob = await this.prisma.analysisJob.findFirst({
      where: {
        requestId,
        attachmentId,
        status: { in: [AnalysisJobStatus.QUEUED, AnalysisJobStatus.RUNNING] },
      },
      select: { id: true },
    });
    if (activeJob) {
      throw new ConflictException('An active analysis already exists for this attachment');
    }

    let job;
    try {
      job = await this.prisma.$transaction(async (transaction) => {
        const created = await transaction.analysisJob.create({
          data: {
            requestId,
            requestItemId: attachment.requestItemId,
            attachmentId,
            taskType: AnalysisTaskType.MEASUREMENT_EXTRACTION,
            status: AnalysisJobStatus.QUEUED,
            provider: this.provider.providerName,
            model: this.provider.modelName,
            modelVersion: this.provider.modelVersion,
            idempotencyKey,
            inputHash: attachment.checksum,
            maxAttempts: this.provider.providerName === 'deterministic' ? 1 : 3,
          },
        });
        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'ANALYSIS_STARTED',
          resource: 'analysis_job',
          resourceId: created.id,
          metadata: this.jobAuditMetadata(created, authenticatedActor.sub),
        }, transaction);
        return created;
      });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002')) {
        throw new ConflictException('Analysis already exists for this attachment input');
      }
      throw error;
    }

    this.jobQueue.enqueue(job.id);
    return this.toPublicJob({ ...job, results: [] });
  }

  async listByAttachment(requestId: string, attachmentId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    await this.getAttachment(requestId, attachmentId);
    const jobs = await this.prisma.analysisJob.findMany({
      where: { requestId, attachmentId },
      include: { results: { include: { detectedMeasurements: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return jobs.map((job) => this.toPublicJob(job));
  }

  async listMeasurements(requestId: string, itemId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    await this.getRequestItem(requestId, itemId);
    return this.prisma.detectedMeasurement.findMany({
      where: {
        analysisResult: {
          analysisJob: { requestId, requestItemId: itemId, status: AnalysisJobStatus.COMPLETED },
        },
      },
      include: {
        analysisResult: {
          select: { id: true, resultVersion: true, reviewStatus: true, version: true, createdAt: true },
        },
      },
      orderBy: [{ analysisResult: { createdAt: 'desc' } }, { ordinal: 'asc' }],
    });
  }

  async review(
    requestId: string,
    itemId: string,
    input: ReviewMeasurementDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
        if (request.status !== RequestStatus.DRAFT) {
          throw new ConflictException('Measurements can only be reviewed while the request is a draft');
        }

        const item = await this.getRequestItem(requestId, itemId, transaction);
        const detected = await transaction.detectedMeasurement.findFirst({
          where: {
            id: input.detectedMeasurementId,
            analysisResult: {
              analysisJob: {
                requestId,
                requestItemId: itemId,
                status: AnalysisJobStatus.COMPLETED,
              },
            },
          },
          include: { analysisResult: { include: { analysisJob: true } } },
        });
        if (!detected) {
          throw new BadRequestException('Detected measurement does not belong to the request item');
        }
        if (input.action === MeasurementReviewAction.CORRECT && !this.hasCorrection(input)) {
          throw new BadRequestException('At least one corrected measurement is required');
        }

        const resultStatus = this.reviewStatus(input.action);
        const resultUpdate = await transaction.analysisResult.updateMany({
          where: {
            id: detected.analysisResultId,
            version: input.analysisResultVersion,
            reviewStatus: AnalysisReviewStatus.PENDING,
          },
          data: {
            reviewStatus: resultStatus,
            reviewedByUserId: authenticatedActor.sub,
            reviewedAt: new Date(),
            reviewReason: input.reason?.trim(),
            version: { increment: 1 },
          },
        });
        this.assertVersionUpdated(resultUpdate.count, 'Analysis result was modified by another review');

        const values = this.reviewedValues(detected, input);
        const itemData = input.action === MeasurementReviewAction.REJECT
          ? {
              measurementStatus: MeasurementStatus.REJECTED,
              updatedByUserId: authenticatedActor.sub,
              version: { increment: 1 },
            }
          : {
              quantity: values.quantity,
              unit: values.unit,
              widthMm: values.widthMm,
              heightMm: values.heightMm,
              lengthMm: values.lengthMm,
              depthMm: values.depthMm,
              thicknessMm: values.thicknessMm,
              calculatedAreaM2: values.calculatedAreaM2,
              calculatedLengthM: values.calculatedLengthM,
              calculatedVolumeM3: values.calculatedVolumeM3,
              sourceAnalysisResultId: detected.analysisResultId,
              measurementSource: input.action === MeasurementReviewAction.CORRECT
                ? MeasurementSource.AI_CORRECTED
                : MeasurementSource.AI,
              measurementStatus: MeasurementStatus.APPROVED,
              updatedByUserId: authenticatedActor.sub,
              version: { increment: 1 },
            };
        const itemUpdate = await transaction.requestItem.updateMany({
          where: { id: itemId, requestId, version: input.requestItemVersion },
          data: itemData,
        });
        this.assertVersionUpdated(itemUpdate.count, 'Request item was modified by another operation');

        const review = await transaction.measurementReview.create({
          data: {
            analysisResultId: detected.analysisResultId,
            detectedMeasurementId: detected.id,
            requestItemId: itemId,
            action: input.action,
            reviewedByUserId: authenticatedActor.sub,
            correctedQuantity: input.action === MeasurementReviewAction.CORRECT ? values.quantity : undefined,
            correctedUnit: input.action === MeasurementReviewAction.CORRECT ? values.unit : undefined,
            correctedWidthMm: input.action === MeasurementReviewAction.CORRECT ? values.widthMm : undefined,
            correctedHeightMm: input.action === MeasurementReviewAction.CORRECT ? values.heightMm : undefined,
            correctedLengthMm: input.action === MeasurementReviewAction.CORRECT ? values.lengthMm : undefined,
            correctedDepthMm: input.action === MeasurementReviewAction.CORRECT ? values.depthMm : undefined,
            correctedThicknessMm: input.action === MeasurementReviewAction.CORRECT ? values.thicknessMm : undefined,
            correctedAreaM2: input.action === MeasurementReviewAction.CORRECT ? values.calculatedAreaM2 : undefined,
            correctedLengthM: input.action === MeasurementReviewAction.CORRECT ? values.calculatedLengthM : undefined,
            correctedVolumeM3: input.action === MeasurementReviewAction.CORRECT ? values.calculatedVolumeM3 : undefined,
            reason: input.reason?.trim(),
            resultVersion: detected.analysisResult.resultVersion,
          },
        });
        const updatedItem = await transaction.requestItem.findUniqueOrThrow({ where: { id: itemId } });
        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'MEASUREMENT_REVIEWED',
          resource: 'measurement_review',
          resourceId: review.id,
          metadata: {
            requestId,
            attachmentId: detected.analysisResult.analysisJob.attachmentId,
            analysisJobId: detected.analysisResult.analysisJobId,
            requestItemId: itemId,
            actorId: authenticatedActor.sub,
            version: updatedItem.version,
            status: updatedItem.measurementStatus,
          },
        }, transaction);
        return { review, requestItem: updatedItem };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (this.isPrismaError(error, 'P2002') || this.isPrismaError(error, 'P2034')) {
        throw new ConflictException('Measurement was reviewed by another operation');
      }
      throw error;
    }
  }

  private reviewedValues(detected: Record<string, any>, input: ReviewMeasurementDto) {
    const corrected = input.action === MeasurementReviewAction.CORRECT;
    const values = {
      quantity: corrected && input.quantity !== undefined ? input.quantity : this.numberOrUndefined(detected.quantity),
      unit: corrected && input.unit !== undefined ? input.unit : detected.unit ?? undefined,
      widthMm: corrected && input.width !== undefined ? input.width : this.numberOrUndefined(detected.widthMm),
      heightMm: corrected && input.height !== undefined ? input.height : this.numberOrUndefined(detected.heightMm),
      lengthMm: corrected && input.length !== undefined ? input.length : this.numberOrUndefined(detected.lengthMm),
      depthMm: corrected && input.depth !== undefined ? input.depth : this.numberOrUndefined(detected.depthMm),
      thicknessMm: corrected && input.thickness !== undefined ? input.thickness : this.numberOrUndefined(detected.thicknessMm),
    };
    return { ...values, ...this.calculateDerived(values) };
  }

  private calculateDerived(values: {
    widthMm?: number;
    heightMm?: number;
    lengthMm?: number;
    depthMm?: number;
  }) {
    return {
      calculatedAreaM2: values.widthMm !== undefined && values.heightMm !== undefined
        ? this.roundSix(values.widthMm * values.heightMm / 1_000_000)
        : undefined,
      calculatedLengthM: values.lengthMm !== undefined
        ? this.roundSix(values.lengthMm / 1000)
        : undefined,
      calculatedVolumeM3: values.widthMm !== undefined
        && values.heightMm !== undefined
        && values.depthMm !== undefined
        ? this.roundSix(values.widthMm * values.heightMm * values.depthMm / 1_000_000_000)
        : undefined,
    };
  }

  private reviewStatus(action: MeasurementReviewAction): AnalysisReviewStatus {
    if (action === MeasurementReviewAction.APPROVE) return AnalysisReviewStatus.APPROVED;
    if (action === MeasurementReviewAction.REJECT) return AnalysisReviewStatus.REJECTED;
    return AnalysisReviewStatus.CORRECTED;
  }

  private hasCorrection(input: ReviewMeasurementDto): boolean {
    return [input.quantity, input.unit, input.width, input.height, input.length, input.depth, input.thickness]
      .some((value) => value !== undefined);
  }

  private async getScopedRequest(requestId: string, actor: AuthenticatedUser, client: DatabaseClient = this.prisma) {
    const request = await client.request.findFirst({
      where: { id: requestId, ...this.buildScopeWhere(actor) },
      select: { id: true, companyId: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  private async getOwnedRequest(requestId: string, actor: AuthenticatedUser, client: DatabaseClient = this.prisma) {
    const request = await client.request.findFirst({
      where: this.canManageScope(actor)
        ? { id: requestId }
        : {
            id: requestId,
            company: {
              memberships: {
                some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
              },
            },
          },
      select: { id: true, companyId: true, status: true },
    });
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  private async getAttachment(requestId: string, attachmentId: string, client: DatabaseClient = this.prisma) {
    const attachment = await client.attachment.findFirst({ where: { id: attachmentId, requestId } });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  private async getRequestItem(requestId: string, itemId: string, client: DatabaseClient = this.prisma) {
    const item = await client.requestItem.findFirst({ where: { id: itemId, requestId } });
    if (!item) throw new NotFoundException('Request item not found');
    return item;
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.RequestWhereInput {
    if (this.canManageScope(actor)) return {};
    const activeMembership = { some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE } };
    return {
      OR: [
        { company: { memberships: activeMembership } },
        {
          status: { not: RequestStatus.DRAFT },
          recipients: { some: { company: { memberships: activeMembership } } },
        },
      ],
    };
  }

  private createIdempotencyKey(attachmentId: string, checksum: string): string {
    return createHash('sha256')
      .update(`${attachmentId}:${checksum}:${AnalysisTaskType.MEASUREMENT_EXTRACTION}:${this.provider.modelVersion}`)
      .digest('hex');
  }

  private jobAuditMetadata(job: {
    id: string;
    requestId: string;
    attachmentId: string;
    requestItemId: string | null;
    status: AnalysisJobStatus;
    version: number;
  }, actorId: string) {
    return {
      requestId: job.requestId,
      attachmentId: job.attachmentId,
      analysisJobId: job.id,
      requestItemId: job.requestItemId,
      actorId,
      version: job.version,
      status: job.status,
    };
  }

  private toPublicJob(job: Record<string, any>) {
    const { leaseToken, failureReason, ...publicJob } = job;
    return {
      ...publicJob,
      results: job.results?.map((result: Record<string, any>) => {
        const { rawOutputStorageKey, ...publicResult } = result;
        return publicResult;
      }),
    };
  }

  private numberOrUndefined(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : Number(value);
  }

  private roundSix(value: number): number {
    return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  }

  private assertVersionUpdated(count: number, message: string): void {
    if (count !== 1) throw new ConflictException(message);
  }

  private requireActor(actor?: AuthenticatedUser): AuthenticatedUser {
    if (!actor) throw new ForbiddenException('Authentication required');
    return actor;
  }

  private canManageScope(actor: AuthenticatedUser): boolean {
    return actor.role === Role.ADMIN
      || actor.role === Role.MANAGER
      || actor.permissions.includes(PERMISSIONS.PLATFORM_ADMIN);
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
  }
}