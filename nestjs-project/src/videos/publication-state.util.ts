import type { Video } from './entities/video.entity';
import { VideoStatus } from './video-status.enum';

export enum PublicationState {
  UPLOADING = 'uploading',
  PROCESSING = 'processing',
  ERROR = 'error',
  UNPUBLISHED = 'unpublished',
  PUBLISHED = 'published',
}

/** Panel-facing state derived from the technical status and `published_at`. */
export function derivePublicationState(
  video: Pick<Video, 'status' | 'published_at'>,
): PublicationState {
  switch (video.status) {
    case VideoStatus.DRAFT:
      return PublicationState.UPLOADING;
    case VideoStatus.PROCESSING:
      return PublicationState.PROCESSING;
    case VideoStatus.ERROR:
      return PublicationState.ERROR;
    case VideoStatus.READY:
      return video.published_at
        ? PublicationState.PUBLISHED
        : PublicationState.UNPUBLISHED;
  }
}

/** A video is reachable by link when it is ready and has been published. */
export function isPublished(
  video: Pick<Video, 'status' | 'published_at'>,
): boolean {
  return (
    video.status === VideoStatus.READY &&
    video.published_at !== null &&
    video.published_at !== undefined
  );
}
