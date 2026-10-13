import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { UnrecoverableError } from 'bullmq';
import type { Job } from 'bullmq';
import { Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import queueConfig from '../config/queue.config';
import { VIDEO_PROCESSING_QUEUE } from '../queue/queue.constants';
import type { VideoProcessJobData } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/video-status.enum';
import { ThumbnailService } from './thumbnail.service';
import { InvalidMediaError, VideoProbeService } from './video-probe.service';

export const INVALID_MEDIA = 'INVALID_MEDIA';
export const PROCESSING_FAILED = 'PROCESSING_FAILED';

const READ_URL_TTL_SECONDS = 3600;
const COMPLETED_JOB_RETENTION = { age: 3600, count: 1000 };
const FAILED_JOB_RETENTION = { age: 7 * 24 * 3600 };

@Processor(VIDEO_PROCESSING_QUEUE, {
  removeOnComplete: COMPLETED_JOB_RETENTION,
  removeOnFail: FAILED_JOB_RETENTION,
})
export class VideoProcessingProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(VideoProcessingProcessor.name);

  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    private readonly storage: StorageService,
    private readonly probeService: VideoProbeService,
    private readonly thumbnails: ThumbnailService,
    @Inject(queueConfig.KEY)
    private readonly queueSettings: ConfigType<typeof queueConfig>,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.worker.concurrency = this.queueSettings.videoWorkerConcurrency;
  }

  async process(job: Job<VideoProcessJobData>): Promise<void> {
    const video = await this.videos.findOneBy({ id: job.data.videoId });
    if (!video || video.status !== VideoStatus.PROCESSING) {
      // Redelivered job for a video that already finished (or is gone): nothing to do.
      this.logger.warn(
        `Skipping job ${String(job.id)}: video ${job.data.videoId} is not processing`,
      );
      return;
    }

    const sourceUrl = await this.storage.presignGetObject(video.storage_key, {
      expiresIn: READ_URL_TTL_SECONDS,
    });
    let probe: Awaited<ReturnType<VideoProbeService['probe']>>;
    try {
      probe = await this.probeService.probe(sourceUrl);
    } catch (error) {
      if (error instanceof InvalidMediaError) {
        throw new UnrecoverableError(INVALID_MEDIA);
      }
      throw error;
    }
    if (!probe.hasVideoStream || probe.durationSeconds === null) {
      throw new UnrecoverableError(INVALID_MEDIA);
    }

    const thumbnailKey = `videos/${video.id}/thumbnail.jpg`;
    await this.thumbnails.generate({
      sourceUrl,
      durationSeconds: probe.durationSeconds,
      destinationKey: thumbnailKey,
    });

    await this.videos.update(
      { id: video.id },
      {
        duration_seconds: probe.durationSeconds,
        metadata: {
          ...probe.metadata,
        } as QueryDeepPartialEntity<Video>['metadata'],
        thumbnail_key: thumbnailKey,
        status: VideoStatus.READY,
        error_reason: null,
        processing_attempts: job.attemptsMade + 1,
      },
    );
  }

  /** Runs after every failed attempt; the video only becomes `erro` once no retry is left. */
  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<VideoProcessJobData> | undefined,
    error: Error,
  ): Promise<void> {
    if (!job) return;
    const unrecoverable =
      error instanceof UnrecoverableError ||
      error.name === 'UnrecoverableError';
    const exhausted = job.attemptsMade >= (job.opts.attempts ?? 1);
    this.logger.warn(
      `Job ${String(job.id)} failed (attempt ${job.attemptsMade}): ${error.message}`,
    );

    const stillProcessing = {
      id: job.data.videoId,
      status: VideoStatus.PROCESSING,
    };
    if (unrecoverable || exhausted) {
      await this.videos.update(stillProcessing, {
        status: VideoStatus.ERROR,
        error_reason:
          unrecoverable && error.message === INVALID_MEDIA
            ? INVALID_MEDIA
            : PROCESSING_FAILED,
        processing_attempts: job.attemptsMade,
      });
    } else {
      await this.videos.update(stillProcessing, {
        processing_attempts: job.attemptsMade,
      });
    }
  }
}
