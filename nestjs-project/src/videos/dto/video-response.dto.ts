import { PublicationState } from '../publication-state.util';
import { VideoStatus } from '../video-status.enum';
import { VideoVisibility } from '../video-visibility.enum';

export class VideoCategoryDto {
  id: string;
  slug: string;
  name: string;
}

export class VideoResponseDto {
  /** Public id of the video. */
  id: string;
  title: string;
  description: string | null;
  /** Technical processing status. */
  status: VideoStatus;
  /** Panel-facing state derived from `status` and `publishedAt`. */
  publicationState: PublicationState;
  visibility: VideoVisibility;
  publishedAt: string | null;
  category: VideoCategoryDto | null;
  durationSeconds: number | null;
  /** Presigned GET URL; present once the thumbnail exists. */
  thumbnailUrl: string | null;
  /** Failure reason, returned only to the owner of a video in `erro`. */
  errorReason: string | null;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  createdAt: string;
}
