import { Injectable } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { execFileBuffer } from './exec.util';
import { computeThumbnailOffset } from './thumbnail-offset.util';

const THUMBNAIL_TIMEOUT_MS = 120_000;
const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';

export interface GenerateThumbnailInput {
  /** Signed URL or local path ffmpeg can read. */
  sourceUrl: string;
  durationSeconds: number;
  /** Storage key to write, e.g. `videos/{id}/thumbnail.jpg`. */
  destinationKey: string;
}

@Injectable()
export class ThumbnailService {
  constructor(private readonly storage: StorageService) {}

  /** Grabs one frame, encodes it as JPEG and uploads it; reruns overwrite the same key. */
  async generate(input: GenerateThumbnailInput): Promise<string> {
    const offset = computeThumbnailOffset(input.durationSeconds);
    const frame = await execFileBuffer(
      'ffmpeg',
      [
        '-v',
        'error',
        '-ss',
        offset.toFixed(3),
        '-i',
        input.sourceUrl,
        '-frames:v',
        '1',
        '-q:v',
        '3',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      { timeoutMs: THUMBNAIL_TIMEOUT_MS, redact: [input.sourceUrl] },
    );
    if (frame.length === 0) {
      throw new Error('ffmpeg produced no frame for the thumbnail');
    }

    await this.storage.putObject(
      input.destinationKey,
      frame,
      THUMBNAIL_CONTENT_TYPE,
    );
    return input.destinationKey;
  }
}
