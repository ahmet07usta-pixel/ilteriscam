import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { AttachmentsService } from './attachments.service';
import { AttachmentVersionDto } from './dto/attachment-version.dto';
import { InitiateAttachmentUploadDto } from './dto/initiate-attachment-upload.dto';

@Controller('requests/:requestId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload-init')
  @Permissions(PERMISSIONS.ATTACHMENTS_CREATE)
  initiateUpload(
    @Param('requestId') requestId: string,
    @Body() body: InitiateAttachmentUploadDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.attachmentsService.initiateUpload(requestId, body, actor);
  }

  @Post(':attachmentId/upload-complete')
  @Permissions(PERMISSIONS.ATTACHMENTS_CREATE)
  completeUpload(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: AttachmentVersionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.attachmentsService.completeUpload(requestId, attachmentId, body.version, actor);
  }

  @Get()
  @Permissions(PERMISSIONS.ATTACHMENTS_READ)
  list(@Param('requestId') requestId: string, @CurrentUser() actor?: AuthenticatedUser) {
    return this.attachmentsService.list(requestId, actor);
  }

  @Get(':attachmentId')
  @Permissions(PERMISSIONS.ATTACHMENTS_READ)
  get(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.attachmentsService.get(requestId, attachmentId, actor);
  }

  @Get(':attachmentId/download')
  @Permissions(PERMISSIONS.ATTACHMENTS_READ)
  download(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.attachmentsService.getDownloadUrl(requestId, attachmentId, actor);
  }

  @Delete(':attachmentId')
  @Permissions(PERMISSIONS.ATTACHMENTS_DELETE)
  delete(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() body: AttachmentVersionDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.attachmentsService.delete(requestId, attachmentId, body.version, actor);
  }
}