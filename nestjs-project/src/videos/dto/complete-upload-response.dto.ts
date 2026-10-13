import { VideoStatus } from '../video-status.enum';

export class CompleteUploadResponseDto {
  /** Public id of the video. */
  id: string;
  status: VideoStatus;
}
