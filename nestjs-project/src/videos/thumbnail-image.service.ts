import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import sharp from 'sharp';
import { InvalidThumbnailException } from '../common/exceptions/domain.exception';
import videoConfig from '../config/video.config';

const ACCEPTED_FORMATS = ['jpeg', 'png', 'webp'];
const OUTPUT_QUALITY = 85;

@Injectable()
export class ThumbnailImageService {
  constructor(
    @Inject(videoConfig.KEY)
    private readonly config: ConfigType<typeof videoConfig>,
  ) {}

  /** Validates the image and returns it resized to fit the limits, as JPEG. */
  async normalize(buffer: Buffer): Promise<Buffer> {
    try {
      const { format } = await sharp(buffer).metadata();
      if (!format || !ACCEPTED_FORMATS.includes(format)) {
        throw new InvalidThumbnailException();
      }
      return await sharp(buffer)
        .rotate()
        .resize({
          width: this.config.thumbnailMaxWidth,
          height: this.config.thumbnailMaxHeight,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: OUTPUT_QUALITY })
        .toBuffer();
    } catch (error) {
      if (error instanceof InvalidThumbnailException) throw error;
      throw new InvalidThumbnailException();
    }
  }
}
