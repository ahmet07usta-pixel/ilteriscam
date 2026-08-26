import { randomUUID } from 'node:crypto';
import { basename } from 'node:path';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentStatus,
  CompanyMembershipStatus,
  Prisma,
  RequestStatus,
  Role,
} from '@prisma/client';

import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PrismaService } from '../../prisma/prisma.service';
import { AnalysisService } from '../analysis/analysis.service';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../rbac/permissions';
import {
  STORAGE_PORT,
  StorageNotFoundError,
  StoragePort,
  StorageValidationError,
} from '../storage/storage.contract';
import { InitiateAttachmentUploadDto } from './dto/initiate-attachment-upload.dto';

type DatabaseClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AttachmentsService {
  private readonly allowedMimeTypes = new Set(['application/pdf', 'image/jpeg', 'image/png']);
  private readonly maxFileSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
    private readonly analysisService: AnalysisService,
  ) {
    this.maxFileSizeBytes = configService.getOrThrow<number>('storage.maxFileSizeBytes');
  }

  async initiateUpload(
    requestId: string,
    input: InitiateAttachmentUploadDto,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    const fileName = this.normalizeFileName(input.fileName);
    const mimeType = this.normalizeMimeType(input.mimeType);
    this.assertFileSize(input.sizeBytes);
    const request = await this.getOwnedRequest(requestId, authenticatedActor);
    this.assertUploadAllowed(request.status);
    await this.assertRequestItemScope(requestId, input.requestItemId, this.prisma);

    const storageKey = randomUUID().replaceAll('-', '');
    const upload = await this.storage.initiateUpload({
      storageKey,
      mimeType,
      sizeBytes: input.sizeBytes,
    });

    try {
      const attachment = await this.prisma.$transaction(async (transaction) => {
        const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
        this.assertUploadAllowed(request.status);
        await this.assertRequestItemScope(requestId, input.requestItemId, transaction);

        const created = await transaction.attachment.create({
          data: {
            requestId,
            requestItemId: input.requestItemId,
            fileName,
            mimeType,
            storageProvider: upload.provider,
            storageKey,
            sizeBytes: BigInt(input.sizeBytes),
            checksum: `pending:${randomUUID()}`,
            uploadedByUserId: authenticatedActor.sub,
            analysisEligible: false,
            status: AttachmentStatus.PENDING_UPLOAD,
          },
        });

        await this.auditService.record({
          actorId: authenticatedActor.sub,
          action: 'ATTACHMENT_UPLOAD_INITIATED',
          resource: 'attachment',
          resourceId: created.id,
          metadata: this.auditMetadata(created, authenticatedActor.sub),
        }, transaction);
        return created;
      });

      return {
        attachment: this.toPublicAttachment(attachment),
        upload: { url: upload.uploadUrl, expiresAt: upload.expiresAt },
      };
    } catch (error) {
      await this.storage.deleteObject(storageKey).catch(() => undefined);
      throw error;
    }
  }

  async list(requestId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    const attachments = await this.prisma.attachment.findMany({
      where: { requestId, status: { not: AttachmentStatus.DELETED } },
      orderBy: { createdAt: 'asc' },
    });
    return attachments.map((attachment) => this.toPublicAttachment(attachment));
  }

  async get(requestId: string, attachmentId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    const attachment = await this.getAttachment(requestId, attachmentId);
    return this.toPublicAttachment(attachment);
  }

  async completeUpload(
    requestId: string,
    attachmentId: string,
    version: number,
    actor?: AuthenticatedUser,
  ) {
    const authenticatedActor = this.requireActor(actor);
    await this.getOwnedRequest(requestId, authenticatedActor);
    const existing = await this.getAttachment(requestId, attachmentId);
    if (existing.status !== AttachmentStatus.PENDING_UPLOAD) {
      throw new ConflictException('Only pending attachment uploads can be completed');
    }

    let completed;
    try {
      completed = await this.storage.completeUpload({
        storageKey: existing.storageKey,
        expectedMimeType: existing.mimeType,
        expectedSizeBytes: Number(existing.sizeBytes),
      });
    } catch (error) {
      if (error instanceof StorageValidationError || error instanceof StorageNotFoundError) {
        await this.quarantineUpload(existing, version, authenticatedActor.sub);
        throw new BadRequestException(error.message);
      }
      throw new ServiceUnavailableException('Storage verification failed');
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.attachment.updateMany({
        where: {
          id: attachmentId,
          requestId,
          version,
          status: AttachmentStatus.PENDING_UPLOAD,
        },
        data: {
          checksum: completed.checksum,
          mimeType: completed.detectedMimeType,
          sizeBytes: BigInt(completed.sizeBytes),
          status: AttachmentStatus.AVAILABLE,
          version: { increment: 1 },
        },
      });
      this.assertVersionUpdated(result.count);

      const attachment = await transaction.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
      await this.auditService.record({
        actorId: authenticatedActor.sub,
        action: 'ATTACHMENT_UPLOADED',
        resource: 'attachment',
        resourceId: attachmentId,
        metadata: this.auditMetadata(attachment, authenticatedActor.sub),
      }, transaction);
      return attachment;
    });

    // Best-effort: measurement extraction starts automatically so the uploader never has to trigger it manually.
    if (this.allowedMimeTypes.has(updated.mimeType)) {
      await this.analysisService.start(requestId, attachmentId, actor).catch(() => undefined);
    }

    return this.toPublicAttachment(updated);
  }

  async getDownloadUrl(requestId: string, attachmentId: string, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);
    await this.getScopedRequest(requestId, authenticatedActor);
    const attachment = await this.getAttachment(requestId, attachmentId);
    if (attachment.status !== AttachmentStatus.AVAILABLE) {
      throw new ConflictException('Attachment is not available for download');
    }

    try {
      return await this.storage.getDownloadUrl({
        storageKey: attachment.storageKey,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
      });
    } catch (error) {
      if (error instanceof StorageNotFoundError) {
        throw new NotFoundException('Attachment object not found');
      }
      throw new ServiceUnavailableException('Download URL could not be created');
    }
  }

  async delete(requestId: string, attachmentId: string, version: number, actor?: AuthenticatedUser) {
    const authenticatedActor = this.requireActor(actor);

    const deleted = await this.prisma.$transaction(async (transaction) => {
      const request = await this.getOwnedRequest(requestId, authenticatedActor, transaction);
      if (request.status !== RequestStatus.DRAFT) {
        throw new ConflictException('Attachments can only be deleted while the request is a draft');
      }

      const existing = await this.getAttachment(requestId, attachmentId, transaction);
      if (existing.status !== AttachmentStatus.AVAILABLE) {
        throw new ConflictException('Only available attachments can be deleted');
      }

      const result = await transaction.attachment.updateMany({
        where: {
          id: attachmentId,
          requestId,
          version,
          status: AttachmentStatus.AVAILABLE,
        },
        data: { status: AttachmentStatus.DELETED, version: { increment: 1 } },
      });
      this.assertVersionUpdated(result.count);

      const attachment = await transaction.attachment.findUniqueOrThrow({ where: { id: attachmentId } });
      await this.auditService.record({
        actorId: authenticatedActor.sub,
        action: 'ATTACHMENT_DELETED',
        resource: 'attachment',
        resourceId: attachmentId,
        metadata: this.auditMetadata(attachment, authenticatedActor.sub),
      }, transaction);
      return attachment;
    });

    try {
      await this.storage.deleteObject(deleted.storageKey);
    } catch {
      throw new ServiceUnavailableException('Attachment was revoked but physical cleanup failed');
    }

    return this.toPublicAttachment(deleted);
  }

  private async quarantineUpload(
    existing: Awaited<ReturnType<AttachmentsService['getAttachment']>>,
    version: number,
    actorId: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.attachment.updateMany({
        where: {
          id: existing.id,
          requestId: existing.requestId,
          version,
          status: AttachmentStatus.PENDING_UPLOAD,
        },
        data: { status: AttachmentStatus.QUARANTINED, version: { increment: 1 } },
      });
      this.assertVersionUpdated(result.count);
      await this.auditService.record({
        actorId,
        action: 'ATTACHMENT_UPLOAD_FAILED',
        resource: 'attachment',
        resourceId: existing.id,
        metadata: {
          requestId: existing.requestId,
          requestItemId: existing.requestItemId,
          attachmentId: existing.id,
          actorId,
          status: AttachmentStatus.QUARANTINED,
          version: version + 1,
        },
      }, transaction);
    });
  }

  private async assertRequestItemScope(
    requestId: string,
    requestItemId: string | undefined,
    client: DatabaseClient,
  ): Promise<void> {
    if (!requestItemId) return;
    const item = await client.requestItem.findFirst({
      where: { id: requestItemId, requestId },
      select: { id: true },
    });
    if (!item) {
      throw new BadRequestException('Request item does not belong to the request');
    }
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
    if (!attachment || attachment.status === AttachmentStatus.DELETED) {
      throw new NotFoundException('Attachment not found');
    }
    return attachment;
  }

  private buildScopeWhere(actor: AuthenticatedUser): Prisma.RequestWhereInput {
    if (this.canManageScope(actor)) return {};
    const activeMembership = {
      some: { userId: actor.sub, status: CompanyMembershipStatus.ACTIVE },
    };
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

  private normalizeFileName(value: string): string {
    const normalized = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
    if (
      !normalized
      || normalized === '.'
      || normalized === '..'
      || basename(normalized) !== normalized
      || /[\u0000-\u001f\u007f<>:"/\\|?*]/.test(normalized)
    ) {
      throw new BadRequestException('Invalid file name');
    }
    return normalized;
  }

  private normalizeMimeType(value: string): string {
    const mimeType = value.trim().toLowerCase();
    if (!this.allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException('Unsupported MIME type');
    }
    return mimeType;
  }

  private assertFileSize(sizeBytes: number): void {
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > this.maxFileSizeBytes) {
      throw new BadRequestException(`File size must be between 1 and ${this.maxFileSizeBytes} bytes`);
    }
  }

  private assertUploadAllowed(status: RequestStatus): void {
    if (status !== RequestStatus.DRAFT && status !== RequestStatus.OPEN_FOR_QUOTATION) {
      throw new ConflictException('Attachments cannot be added in the current request status');
    }
  }

  private assertVersionUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException('Attachment was modified by another operation');
    }
  }

  private auditMetadata(attachment: {
    id: string;
    requestId: string;
    requestItemId: string | null;
    status: AttachmentStatus;
    version: number;
  }, actorId: string) {
    return {
      requestId: attachment.requestId,
      requestItemId: attachment.requestItemId,
      attachmentId: attachment.id,
      actorId,
      status: attachment.status,
      version: attachment.version,
    };
  }

  private toPublicAttachment(attachment: {
    id: string;
    requestId: string;
    requestItemId: string | null;
    fileName: string;
    mimeType: string;
    sizeBytes: bigint;
    uploadedByUserId: string | null;
    analysisEligible: boolean;
    status: AttachmentStatus;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: attachment.id,
      requestId: attachment.requestId,
      requestItemId: attachment.requestItemId,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      sizeBytes: Number(attachment.sizeBytes),
      uploadedByUserId: attachment.uploadedByUserId,
      analysisEligible: attachment.analysisEligible,
      status: attachment.status,
      version: attachment.version,
      createdAt: attachment.createdAt,
      updatedAt: attachment.updatedAt,
    };
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
}