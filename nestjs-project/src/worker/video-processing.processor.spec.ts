import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import type { VideoProcessJobData } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/video-status.enum';
import { ThumbnailService } from './thumbnail.service';
import { InvalidMediaError, VideoProbeService } from './video-probe.service';
import { VideoProcessingProcessor } from './video-processing.processor';

const queueSettings = {
  redisHost: 'redis',
  redisPort: 6379,
  videoProcessingAttempts: 3,
  videoProcessingBackoffMs: 5000,
  videoWorkerConcurrency: 2,
};

const processingVideo = {
  id: 'video-1',
  status: VideoStatus.PROCESSING,
  storage_key: 'videos/video-1/original.mp4',
} as Video;

const probeOk = {
  durationSeconds: 125.5,
  hasVideoStream: true,
  metadata: {
    container: 'mov,mp4',
    videoCodec: 'h264',
    audioCodec: 'aac',
    width: 1920,
    height: 1080,
    bitrate: 800000,
  },
};

function buildJob(attemptsMade = 0, attempts = 3): Job<VideoProcessJobData> {
  return {
    id: 'job-1',
    data: { videoId: 'video-1' },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<VideoProcessJobData>;
}

describe('VideoProcessingProcessor', () => {
  let videos: { findOneBy: jest.Mock; update: jest.Mock };
  let storage: { presignGetObject: jest.Mock };
  let probe: { probe: jest.Mock };
  let thumbnails: { generate: jest.Mock };
  let processor: VideoProcessingProcessor;

  beforeEach(() => {
    videos = {
      findOneBy: jest.fn().mockResolvedValue(processingVideo),
      update: jest.fn().mockResolvedValue(undefined),
    };
    storage = {
      presignGetObject: jest.fn().mockResolvedValue('https://storage/signed'),
    };
    probe = { probe: jest.fn().mockResolvedValue(probeOk) };
    thumbnails = { generate: jest.fn().mockResolvedValue('key') };
    processor = new VideoProcessingProcessor(
      videos as unknown as Repository<Video>,
      storage as unknown as StorageService,
      probe as unknown as VideoProbeService,
      thumbnails as unknown as ThumbnailService,
      queueSettings,
    );
  });

  describe('process', () => {
    it('should store metadata and thumbnail and mark the video ready', async () => {
      await processor.process(buildJob(1));

      expect(thumbnails.generate).toHaveBeenCalledWith({
        sourceUrl: 'https://storage/signed',
        durationSeconds: 125.5,
        destinationKey: 'videos/video-1/thumbnail.jpg',
      });
      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        {
          duration_seconds: 125.5,
          metadata: probeOk.metadata,
          thumbnail_key: 'videos/video-1/thumbnail.jpg',
          status: VideoStatus.READY,
          error_reason: null,
          processing_attempts: 2,
        },
      );
    });

    it('should skip a video that is not processing anymore', async () => {
      videos.findOneBy.mockResolvedValue({
        ...processingVideo,
        status: VideoStatus.READY,
      });

      await processor.process(buildJob());

      expect(probe.probe).not.toHaveBeenCalled();
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should skip a job whose video no longer exists', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await processor.process(buildJob());

      expect(probe.probe).not.toHaveBeenCalled();
    });

    it('should fail without retry when the file has no video stream', async () => {
      probe.probe.mockResolvedValue({ ...probeOk, hasVideoStream: false });

      const error = await processor.process(buildJob()).catch((e: Error) => e);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect((error as Error).message).toBe('INVALID_MEDIA');
      expect(thumbnails.generate).not.toHaveBeenCalled();
    });

    it('should fail without retry when no duration can be read', async () => {
      probe.probe.mockResolvedValue({ ...probeOk, durationSeconds: null });

      await expect(processor.process(buildJob())).rejects.toBeInstanceOf(
        UnrecoverableError,
      );
    });

    it('should fail without retry when ffprobe says the data is invalid', async () => {
      probe.probe.mockRejectedValue(new InvalidMediaError());

      const error = await processor.process(buildJob()).catch((e: Error) => e);

      expect(error).toBeInstanceOf(UnrecoverableError);
      expect((error as Error).message).toBe('INVALID_MEDIA');
    });

    it('should let probe errors propagate so BullMQ retries', async () => {
      probe.probe.mockRejectedValue(new Error('ffprobe exited with 1'));

      await expect(processor.process(buildJob())).rejects.toThrow(
        'ffprobe exited with 1',
      );
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should let thumbnail errors propagate so BullMQ retries', async () => {
      thumbnails.generate.mockRejectedValue(new Error('ffmpeg failed'));

      await expect(processor.process(buildJob())).rejects.toThrow(
        'ffmpeg failed',
      );
      expect(videos.update).not.toHaveBeenCalled();
    });
  });

  describe('onFailed', () => {
    it('should only record the attempt while retries remain', async () => {
      await processor.onFailed(buildJob(1), new Error('storage down'));

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.PROCESSING },
        { processing_attempts: 1 },
      );
    });

    it('should mark the video as failed once the attempts are exhausted', async () => {
      await processor.onFailed(buildJob(3), new Error('storage down'));

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.PROCESSING },
        {
          status: VideoStatus.ERROR,
          error_reason: 'PROCESSING_FAILED',
          processing_attempts: 3,
        },
      );
    });

    it('should mark invalid media as failed on the first attempt', async () => {
      await processor.onFailed(
        buildJob(1),
        new UnrecoverableError('INVALID_MEDIA'),
      );

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.PROCESSING },
        {
          status: VideoStatus.ERROR,
          error_reason: 'INVALID_MEDIA',
          processing_attempts: 1,
        },
      );
    });

    it('should use PROCESSING_FAILED for other unrecoverable errors', async () => {
      await processor.onFailed(buildJob(1), new UnrecoverableError('boom'));

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1', status: VideoStatus.PROCESSING },
        expect.objectContaining({ error_reason: 'PROCESSING_FAILED' }),
      );
    });

    it('should ignore a failure event without a job', async () => {
      await processor.onFailed(undefined, new Error('lost'));

      expect(videos.update).not.toHaveBeenCalled();
    });
  });
});
