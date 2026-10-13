export const VIDEO_PROCESSING_QUEUE = 'video-processing';
export const VIDEO_PROCESS_JOB = 'video.process';

export interface VideoProcessJobData {
  /** Internal video id (uuid), not the public id. */
  videoId: string;
}
