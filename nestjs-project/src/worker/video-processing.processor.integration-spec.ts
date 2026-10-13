import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import {
  VIDEO_PROCESS_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../queue/queue.constants';
import { VideoQueueModule } from '../queue/video-queue.module';
import { StorageBootstrapService } from '../storage/storage-bootstrap.service';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { createSampleVideo } from '../test/media-fixtures';
import { createNonMedia } from '../test/media-fixtures';
import { createUserWithChannel } from '../test/video-fixtures';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { VideoStatus } from '../videos/video-status.enum';
import { ThumbnailService } from './thumbnail.service';
import { VideoProbeService } from './video-probe.service';
import { VideoProcessingProcessor } from './video-processing.processor';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

async function waitFor<T>(
  read: () => Promise<T>,
  done: (value: T) => boolean,
  timeoutMs = 45000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(
        `Timed out waiting; last value: ${JSON.stringify(value)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe('VideoProcessingProcessor (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let storage: StorageService;
  let queue: Queue;
  let channel: Channel;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [queueConfig, storageConfig, videoConfig],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        TypeOrmModule.forFeature([Video, Category, Channel, User]),
        StorageModule,
        VideoQueueModule,
      ],
      providers: [
        VideoProbeService,
        ThumbnailService,
        VideoProcessingProcessor,
      ],
    }).compile();
    await moduleRef.init();
    await moduleRef.get(StorageBootstrapService).ensureBucket();
    dataSource = moduleRef.get(DataSource);
    storage = moduleRef.get(StorageService);
    queue = moduleRef.get(getQueueToken(VIDEO_PROCESSING_QUEUE));
  }, 90000);

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    await queue.obliterate({ force: true });
    ({ channel } = await createUserWithChannel(dataSource));
  });

  async function processingVideo(storageKey: string): Promise<Video> {
    return dataSource.getRepository(Video).save(
      dataSource.getRepository(Video).create({
        id: storageKey.split('/')[1],
        public_id: randomUUID().replace(/-/g, '').slice(0, 11),
        channel_id: channel.id,
        title: 'Aula',
        status: VideoStatus.PROCESSING,
        file_name: 'aula.mp4',
        content_type: 'video/mp4',
        declared_size: 1000,
        size_bytes: 1000,
        storage_key: storageKey,
      }),
    );
  }

  async function uploadFile(key: string, path: string): Promise<void> {
    await storage.putObject(key, await readFile(path), 'video/mp4');
  }

  const reload = (id: string) =>
    dataSource.getRepository(Video).findOneByOrFail({ id });

  it('should process a valid video into ready with duration and thumbnail', async () => {
    const id = randomUUID();
    const key = `videos/${id}/original.mp4`;
    await uploadFile(key, await createSampleVideo(2));
    await processingVideo(key);

    await queue.add(VIDEO_PROCESS_JOB, { videoId: id });
    const video = await waitFor(
      () => reload(id),
      (v) => v.status !== VideoStatus.PROCESSING,
    );

    expect(video.status).toBe(VideoStatus.READY);
    expect(video.duration_seconds).toBeGreaterThan(1.5);
    expect(video.thumbnail_key).toBe(`videos/${id}/thumbnail.jpg`);
    expect(video.error_reason).toBeNull();
    expect(video.metadata).toMatchObject({ videoCodec: 'h264', width: 320 });
    const thumbnail = await fetch(
      await storage.presignGetObject(video.thumbnail_key!),
    );
    expect(thumbnail.status).toBe(200);
  }, 90000);

  it('should fail invalid media on the first attempt without retrying', async () => {
    const id = randomUUID();
    const key = `videos/${id}/original.mp4`;
    await uploadFile(key, await createNonMedia());
    await processingVideo(key);

    await queue.add(
      VIDEO_PROCESS_JOB,
      { videoId: id },
      { attempts: 3, backoff: { type: 'fixed', delay: 100 } },
    );
    const video = await waitFor(
      () => reload(id),
      (v) => v.status !== VideoStatus.PROCESSING,
    );

    expect(video.status).toBe(VideoStatus.ERROR);
    expect(video.error_reason).toBe('INVALID_MEDIA');
    expect(video.processing_attempts).toBe(1);
  }, 90000);

  it('should stay processing while retries remain and fail after exhausting them', async () => {
    const id = randomUUID();
    // No object exists under this key, so every attempt fails.
    await processingVideo(`videos/${id}/original.mp4`);

    await queue.add(
      VIDEO_PROCESS_JOB,
      { videoId: id },
      { attempts: 3, backoff: { type: 'fixed', delay: 1500 } },
    );
    const afterFirst = await waitFor(
      () => reload(id),
      (v) => v.processing_attempts >= 1,
    );
    expect(afterFirst.status).toBe(VideoStatus.PROCESSING);

    const final = await waitFor(
      () => reload(id),
      (v) => v.status !== VideoStatus.PROCESSING,
    );
    expect(final.status).toBe(VideoStatus.ERROR);
    expect(final.error_reason).toBe('PROCESSING_FAILED');
    expect(final.processing_attempts).toBe(3);
  }, 120000);

  it('should leave an already ready video untouched when its job is redelivered', async () => {
    const id = randomUUID();
    const video = await processingVideo(`videos/${id}/original.mp4`);
    await dataSource
      .getRepository(Video)
      .update(
        { id: video.id },
        { status: VideoStatus.READY, duration_seconds: 99 },
      );

    const job = await queue.add(VIDEO_PROCESS_JOB, { videoId: id });
    await waitFor(
      () => job.getState(),
      (state) => state === 'completed',
    );

    const after = await reload(id);
    expect(after.status).toBe(VideoStatus.READY);
    expect(after.duration_seconds).toBe(99);
  }, 60000);
});
