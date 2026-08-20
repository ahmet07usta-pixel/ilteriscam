import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { pipeline } from 'node:stream/promises';

import { Public } from '../../common/decorators/public.decorator';
import {
  STORAGE_PORT,
  StorageNotFoundError,
  StoragePort,
  StorageValidationError,
} from './storage.contract';

@Controller('storage')
export class StorageController {
  constructor(@Inject(STORAGE_PORT) private readonly storage: StoragePort) {}

  @Put('uploads/:uploadToken')
  @Public()
  @HttpCode(HttpStatus.NO_CONTENT)
  async upload(
    @Param('uploadToken') uploadToken: string,
    @Req() request: Request,
    @Headers('content-length') contentLength?: string,
    @Headers('content-type') contentType?: string,
  ) {
    const parsedLength = contentLength === undefined ? undefined : Number(contentLength);
    try {
      await this.storage.acceptUpload(uploadToken, request, parsedLength, contentType);
    } catch (error) {
      this.rethrowStorageError(error);
    }
  }

  @Get('downloads/:downloadToken')
  @Public()
  async download(
    @Param('downloadToken') downloadToken: string,
    @Res() response: Response,
  ) {
    let object;
    try {
      object = await this.storage.openDownload(downloadToken);
    } catch (error) {
      this.rethrowStorageError(error);
    }
    response.setHeader('Content-Type', object.mimeType);
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(object.fileName)}`);
    response.setHeader('Cache-Control', 'private, no-store');
    await pipeline(object.stream, response);
  }

  private rethrowStorageError(error: unknown): never {
    if (error instanceof StorageValidationError) {
      throw new BadRequestException(error.message);
    }
    if (error instanceof StorageNotFoundError) {
      throw new NotFoundException(error.message);
    }
    throw new ServiceUnavailableException('Storage operation failed');
  }
}