import { VideoStatus } from '../video-status.enum';

export class CreateVideoResponseDto {
  /** Public id of the video (11-character base62). */
  id: string;
  title: string;
  status: VideoStatus;
  /** Bytes per part; the last part may be smaller. */
  partSize: number;
  totalParts: number;
}
