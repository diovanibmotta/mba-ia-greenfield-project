import { VideoStatus } from '../video-status.enum';

export class VideoResponseDto {
  /** Public id of the video. */
  id: string;
  title: string;
  status: VideoStatus;
  durationSeconds: number | null;
  /** Presigned GET URL; present once the thumbnail exists. */
  thumbnailUrl: string | null;
  /** Failure reason, returned only to the owner of a video in `erro`. */
  errorReason: string | null;
  createdAt: string;
}
