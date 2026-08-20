import { Body, Controller, Get, Param, Post } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PERMISSIONS } from '../rbac/permissions';
import { AnalysisService } from './analysis.service';
import { ReviewMeasurementDto } from './dto/review-measurement.dto';

@Controller('requests/:requestId')
export class AnalysisController {
  constructor(private readonly analysisService: AnalysisService) {}

  @Post('attachments/:attachmentId/analysis')
  @Permissions(PERMISSIONS.ANALYSIS_CREATE)
  start(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.analysisService.start(requestId, attachmentId, actor);
  }

  @Get('attachments/:attachmentId/analysis')
  @Permissions(PERMISSIONS.ANALYSIS_READ)
  listByAttachment(
    @Param('requestId') requestId: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.analysisService.listByAttachment(requestId, attachmentId, actor);
  }

  @Get('items/:itemId/measurements')
  @Permissions(PERMISSIONS.ANALYSIS_READ)
  listMeasurements(
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.analysisService.listMeasurements(requestId, itemId, actor);
  }

  @Post('items/:itemId/measurement-review')
  @Permissions(PERMISSIONS.ANALYSIS_REVIEW)
  review(
    @Param('requestId') requestId: string,
    @Param('itemId') itemId: string,
    @Body() body: ReviewMeasurementDto,
    @CurrentUser() actor?: AuthenticatedUser,
  ) {
    return this.analysisService.review(requestId, itemId, body, actor);
  }
}