import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Observable } from 'rxjs';
import {
  InvalidThumbnailException,
  ThumbnailTooLargeException,
} from '../common/exceptions/domain.exception';

export const THUMBNAIL_FIELD = 'file';

/** Multer interceptor that reports upload problems as thumbnail domain errors. */
export class ThumbnailUploadInterceptor extends FileInterceptor(
  THUMBNAIL_FIELD,
) {
  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw new ThumbnailTooLargeException();
      }
      if (error instanceof BadRequestException) {
        throw new InvalidThumbnailException();
      }
      throw error;
    }
  }
}
