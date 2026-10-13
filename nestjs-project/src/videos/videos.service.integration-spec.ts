import { getQueueToken } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import appConfig from '../config/app.config';
import authConfig from '../config/auth.config';
import mailConfig from '../config/mail.config';
import queueConfig from '../config/queue.config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import {
  VIDEO_PROCESS_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { createUserWithChannel } from '../test/video-fixtures';
import { User } from '../users/entities/user.entity';
import { Video } from './entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { VideoStatus } from './video-status.enum';
import { VideoVisibility } from './video-visibility.enum';
import { VideosModule } from './videos.module';
import { VideosService } from './videos.service';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('VideosService (integration)', () => {
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let service: VideosService;
  let storage: StorageService;
  let queue: Queue;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            appConfig,
            authConfig,
            mailConfig,
            queueConfig,
            storageConfig,
            videoConfig,
          ],
        }),
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        VideosModule,
      ],
    }).compile();
    await moduleRef.init();
    dataSource = moduleRef.get(DataSource);
    service = moduleRef.get(VideosService);
    storage = moduleRef.get(StorageService);
    queue = moduleRef.get(getQueueToken(VIDEO_PROCESSING_QUEUE));
  }, 60000);

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    await queue.obliterate({ force: true });
  });

  describe('createDraft', () => {
    it('should persist the draft and open a multipart upload in storage', async () => {
      const { user, channel } = await createUserWithChannel(dataSource);

      const result = await service.createDraft(user.id, {
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      });

      expect(result).toMatchObject({
        title: 'aula',
        status: VideoStatus.DRAFT,
        partSize: 16777216,
        totalParts: 64,
      });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: result.id });
      expect(row.channel_id).toBe(channel.id);
      expect(row.status).toBe(VideoStatus.DRAFT);
      expect(row.declared_size).toBe(1073741824);
      expect(row.storage_key).toBe(`videos/${row.id}/original.mp4`);
      expect(row.upload_id).toBeTruthy();
      // An open multipart upload lists zero parts instead of failing.
      await expect(
        storage.listParts(row.storage_key, row.upload_id!),
      ).resolves.toEqual([]);
    });

    it('should not persist anything when the size limit is exceeded', async () => {
      const { user } = await createUserWithChannel(dataSource);

      await expect(
        service.createDraft(user.id, {
          fileName: 'grande.mp4',
          fileSize: 10737418241,
          contentType: 'video/mp4',
        }),
      ).rejects.toMatchObject({ errorCode: 'FILE_TOO_LARGE' });

      expect(await dataSource.getRepository(Video).count()).toBe(0);
    });
  });

  describe('getPartUrls', () => {
    async function createDraftFor(userId: string) {
      return service.createDraft(userId, {
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      });
    }

    it('should issue URLs that accept the PUT of a part', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const draft = await createDraftFor(user.id);

      const { urls, expiresIn } = await service.getPartUrls(
        user.id,
        draft.id,
        [1],
      );

      expect(expiresIn).toBeGreaterThan(0);
      const response = await fetch(urls[0].url, {
        method: 'PUT',
        body: new Blob([new Uint8Array(5 * 1024 * 1024).fill(1)]),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('etag')).toBeTruthy();
    });

    it('should not expose a draft to another user', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const { user: other } = await createUserWithChannel(dataSource);
      const draft = await createDraftFor(user.id);

      await expect(
        service.getPartUrls(other.id, draft.id, [1]),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_NOT_FOUND' });
    });
  });

  describe('listUploadedParts', () => {
    it('should list the parts sent to storage for an open upload', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const draft = await service.createDraft(user.id, {
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      });
      await expect(
        service.listUploadedParts(user.id, draft.id),
      ).resolves.toEqual({ parts: [] });

      const { urls } = await service.getPartUrls(user.id, draft.id, [1, 2]);
      for (const [index, { url }] of urls.entries()) {
        const size = index === 0 ? 5 * 1024 * 1024 : 1024;
        const response = await fetch(url, {
          method: 'PUT',
          body: new Blob([new Uint8Array(size).fill(index + 1)]),
        });
        expect(response.status).toBe(200);
      }

      const { parts } = await service.listUploadedParts(user.id, draft.id);
      expect(parts.map((p) => [p.partNumber, p.size])).toEqual([
        [1, 5 * 1024 * 1024],
        [2, 1024],
      ]);
      expect(parts.every((p) => p.eTag.length > 0)).toBe(true);
    });
  });

  describe('completeUpload', () => {
    const FIRST_PART = 5 * 1024 * 1024;
    const SECOND_PART = 12 * 1024 * 1024;

    async function uploadedDraft(userId: string, secondPart = SECOND_PART) {
      const draft = await service.createDraft(userId, {
        fileName: 'aula.mp4',
        fileSize: FIRST_PART + SECOND_PART,
        contentType: 'video/mp4',
      });
      const { urls } = await service.getPartUrls(userId, draft.id, [1, 2]);
      const parts: { partNumber: number; eTag: string }[] = [];
      for (const [index, { partNumber, url }] of urls.entries()) {
        const size = index === 0 ? FIRST_PART : secondPart;
        const response = await fetch(url, {
          method: 'PUT',
          body: new Blob([new Uint8Array(size).fill(index + 1)]),
        });
        parts.push({ partNumber, eTag: response.headers.get('etag')! });
      }
      return { draft, parts };
    }

    it('should consolidate the object, update the row and enqueue the job', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const { draft, parts } = await uploadedDraft(user.id);

      const result = await service.completeUpload(user.id, draft.id, { parts });

      expect(result).toEqual({ id: draft.id, status: VideoStatus.PROCESSING });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: draft.id });
      expect(row.status).toBe(VideoStatus.PROCESSING);
      expect(row.size_bytes).toBe(FIRST_PART + SECOND_PART);
      expect(row.upload_id).toBeNull();

      const object = await fetch(
        await storage.presignGetObject(row.storage_key),
      );
      expect((await object.arrayBuffer()).byteLength).toBe(
        FIRST_PART + SECOND_PART,
      );

      const jobs = await queue.getJobs(['waiting', 'delayed']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe(VIDEO_PROCESS_JOB);
      expect(jobs[0].data).toEqual({ videoId: row.id });
      expect(jobs[0].opts.attempts).toBe(3);
    });

    it('should abort the multipart when the stored size differs from the declared size', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const { draft, parts } = await uploadedDraft(user.id, SECOND_PART + 1024);
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: draft.id });

      await expect(
        service.completeUpload(user.id, draft.id, { parts }),
      ).rejects.toMatchObject({ errorCode: 'UPLOAD_SIZE_MISMATCH' });

      await expect(
        storage.listParts(row.storage_key, row.upload_id!),
      ).rejects.toMatchObject({ name: 'NoSuchUpload' });
      const after = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ id: row.id });
      expect(after.upload_id).toBeNull();
      expect(await queue.getJobs(['waiting', 'delayed'])).toHaveLength(0);
    });
  });

  describe('cancelUpload', () => {
    it('should abort the multipart in storage and remove the row', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const draft = await service.createDraft(user.id, {
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: draft.id });

      await service.cancelUpload(user.id, draft.id);

      expect(
        await dataSource.getRepository(Video).countBy({ id: row.id }),
      ).toBe(0);
      await expect(
        storage.listParts(row.storage_key, row.upload_id!),
      ).rejects.toMatchObject({ name: 'NoSuchUpload' });
    });
  });

  describe('getVideo', () => {
    async function insertVideo(
      channelId: string,
      overrides: Partial<Video>,
    ): Promise<Video> {
      const repository = dataSource.getRepository(Video);
      return repository.save(
        repository.create({
          public_id: Math.random().toString(36).slice(2, 13).padEnd(11, 'x'),
          channel_id: channelId,
          title: 'Aula',
          file_name: 'aula.mp4',
          content_type: 'video/mp4',
          declared_size: 1000,
          storage_key: 'videos/some/original.mp4',
          ...overrides,
        }),
      );
    }

    it('should return a published video with category, counters and a working thumbnail URL', async () => {
      const { channel } = await createUserWithChannel(dataSource);
      const key = `videos/${Date.now()}/thumbnail.jpg`;
      await storage.putObject(
        key,
        Buffer.from([0xff, 0xd8, 0xff]),
        'image/jpeg',
      );
      const category = await dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'educacao' });
      const video = await insertVideo(channel.id, {
        status: VideoStatus.READY,
        duration_seconds: 12.5,
        thumbnail_key: key,
        category_id: category.id,
        description: 'Descrição',
        visibility: VideoVisibility.UNLISTED,
        published_at: new Date(),
      });

      const result = await service.getVideo(video.public_id);

      expect(result).toMatchObject({
        id: video.public_id,
        status: VideoStatus.READY,
        publicationState: 'published',
        visibility: 'unlisted',
        description: 'Descrição',
        category: { slug: 'educacao', name: 'Educação' },
        durationSeconds: 12.5,
        viewCount: 0,
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
      });
      expect(result.publishedAt).toEqual(expect.any(String));
      const thumbnail = await fetch(result.thumbnailUrl!);
      expect(thumbnail.status).toBe(200);
    });

    it('should apply the access rule against persisted channels', async () => {
      const { user, channel } = await createUserWithChannel(dataSource);
      const { user: other } = await createUserWithChannel(dataSource);
      const unpublished = await insertVideo(channel.id, {
        status: VideoStatus.READY,
        published_at: null,
      });
      const failed = await insertVideo(channel.id, {
        status: VideoStatus.ERROR,
        error_reason: 'INVALID_MEDIA',
      });

      for (const video of [unpublished, failed]) {
        await expect(service.getVideo(video.public_id)).rejects.toMatchObject({
          errorCode: 'VIDEO_NOT_FOUND',
        });
        await expect(
          service.getVideo(video.public_id, other.id),
        ).rejects.toMatchObject({ errorCode: 'VIDEO_NOT_FOUND' });
      }
      await expect(
        service.getVideo(unpublished.public_id, user.id),
      ).resolves.toMatchObject({ publicationState: 'unpublished' });
      await expect(
        service.getVideo(failed.public_id, user.id),
      ).resolves.toMatchObject({
        publicationState: 'error',
        errorReason: 'INVALID_MEDIA',
      });
    });
  });

  describe('getPlaybackUrl', () => {
    const OBJECT_SIZE = 4096;

    async function readyVideo(
      fileName = 'aula.mp4',
      overrides: Partial<Video> = {},
    ): Promise<Video> {
      const { channel } = await createUserWithChannel(dataSource);
      const id = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const key = `videos/${id}/original.mp4`;
      await storage.putObject(key, Buffer.alloc(OBJECT_SIZE, 7), 'video/mp4');
      const repository = dataSource.getRepository(Video);
      return repository.save(
        repository.create({
          public_id: id.replace(/\D/g, '').slice(0, 11).padEnd(11, '0'),
          channel_id: channel.id,
          title: 'Aula',
          status: VideoStatus.READY,
          published_at: new Date(),
          file_name: fileName,
          content_type: 'video/mp4',
          declared_size: OBJECT_SIZE,
          size_bytes: OBJECT_SIZE,
          storage_key: key,
          ...overrides,
        }),
      );
    }

    it('should issue a streaming URL that honours Range requests', async () => {
      const video = await readyVideo();

      const { url, expiresIn } = await service.getPlaybackUrl(
        video.public_id,
        undefined,
        { download: false },
      );

      expect(expiresIn).toBeGreaterThan(0);
      const response = await fetch(url, { headers: { Range: 'bytes=0-99' } });
      expect(response.status).toBe(206);
      expect((await response.arrayBuffer()).byteLength).toBe(100);
      expect(response.headers.get('content-disposition')).toBeNull();
    });

    it('should issue a streaming URL for an unlisted published video', async () => {
      const video = await readyVideo('aula.mp4', {
        visibility: VideoVisibility.UNLISTED,
      });

      await expect(
        service.getPlaybackUrl(video.public_id, undefined, { download: false }),
      ).resolves.toHaveProperty('url');
    });

    it('should hide an unpublished ready video from anonymous callers but not from its owner', async () => {
      const video = await readyVideo('aula.mp4', { published_at: null });
      const owner = await dataSource
        .getRepository(Channel)
        .findOneByOrFail({ id: video.channel_id });

      await expect(
        service.getPlaybackUrl(video.public_id, undefined, { download: false }),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_NOT_FOUND' });
      await expect(
        service.getPlaybackUrl(video.public_id, owner.user_id, {
          download: false,
        }),
      ).resolves.toHaveProperty('url');
    });

    it('should issue a download URL with an attachment disposition and the full body', async () => {
      const video = await readyVideo('minha aula.mp4');

      const { url } = await service.getPlaybackUrl(video.public_id, undefined, {
        download: true,
      });

      const response = await fetch(url);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="minha aula.mp4"',
      );
      expect((await response.arrayBuffer()).byteLength).toBe(OBJECT_SIZE);
    });

    it('should neutralise quotes in the download file name', async () => {
      const video = await readyVideo('a"b.mp4');

      const { url } = await service.getPlaybackUrl(video.public_id, undefined, {
        download: true,
      });

      const response = await fetch(url);
      expect(response.headers.get('content-disposition')).toBe(
        'attachment; filename="a_b.mp4"',
      );
    });
  });

  describe('updateVideo', () => {
    async function insertOwned(userId: string, overrides: Partial<Video> = {}) {
      const channel = await dataSource
        .getRepository(Channel)
        .findOneByOrFail({ user_id: userId });
      const repository = dataSource.getRepository(Video);
      return repository.save(
        repository.create({
          public_id: Math.random().toString(36).slice(2, 13).padEnd(11, 'x'),
          channel_id: channel.id,
          title: 'Aula',
          status: VideoStatus.READY,
          file_name: 'aula.mp4',
          content_type: 'video/mp4',
          declared_size: 1000,
          storage_key: 'videos/some/original.mp4',
          ...overrides,
        }),
      );
    }

    it('should persist title, description, category and visibility', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const video = await insertOwned(user.id);
      const category = await dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'tecnologia' });

      const result = await service.updateVideo(user.id, video.public_id, {
        title: 'Novo título',
        description: 'Nova descrição',
        categoryId: category.id,
        visibility: VideoVisibility.UNLISTED,
      });

      expect(result).toMatchObject({
        title: 'Novo título',
        description: 'Nova descrição',
        visibility: 'unlisted',
        category: { slug: 'tecnologia' },
      });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ id: video.id });
      expect(row.category_id).toBe(category.id);
      expect(row.title).toBe('Novo título');
    });

    it('should reject an unknown category and leave the video unchanged', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const video = await insertOwned(user.id);

      await expect(
        service.updateVideo(user.id, video.public_id, {
          title: 'Mudou',
          categoryId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toMatchObject({ errorCode: 'CATEGORY_NOT_FOUND' });

      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ id: video.id });
      expect(row.title).toBe('Aula');
    });

    it('should not let another user edit the video', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const { user: other } = await createUserWithChannel(dataSource);
      const video = await insertOwned(user.id);

      await expect(
        service.updateVideo(other.id, video.public_id, { title: 'x' }),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_NOT_FOUND' });
    });

    it('should block edits while the upload is open', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const video = await insertOwned(user.id, {
        status: VideoStatus.DRAFT,
        upload_id: 'upload-1',
      });

      await expect(
        service.updateVideo(user.id, video.public_id, { title: 'x' }),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_UPLOAD_IN_PROGRESS' });
    });
  });

  describe('publishVideo', () => {
    async function readyDraftForPublish(
      userId: string,
      overrides: Partial<Video> = {},
    ) {
      const channel = await dataSource
        .getRepository(Channel)
        .findOneByOrFail({ user_id: userId });
      const category = await dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'jogos' });
      const repository = dataSource.getRepository(Video);
      return repository.save(
        repository.create({
          public_id: Math.random().toString(36).slice(2, 13).padEnd(11, 'x'),
          channel_id: channel.id,
          category_id: category.id,
          title: 'Aula',
          status: VideoStatus.READY,
          file_name: 'aula.mp4',
          content_type: 'video/mp4',
          declared_size: 1000,
          storage_key: 'videos/some/original.mp4',
          ...overrides,
        }),
      );
    }

    it('should persist published_at and make the video reachable by anonymous callers', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const video = await readyDraftForPublish(user.id);
      await expect(service.getVideo(video.public_id)).rejects.toMatchObject({
        errorCode: 'VIDEO_NOT_FOUND',
      });

      const result = await service.publishVideo(user.id, video.public_id, {
        visibility: VideoVisibility.UNLISTED,
      });

      expect(result).toMatchObject({
        publicationState: 'published',
        visibility: 'unlisted',
      });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ id: video.id });
      expect(row.published_at).toBeInstanceOf(Date);
      await expect(service.getVideo(video.public_id)).resolves.toMatchObject({
        id: video.public_id,
      });
    });

    it('should not publish twice, without category, or while not ready', async () => {
      const { user } = await createUserWithChannel(dataSource);
      const published = await readyDraftForPublish(user.id);
      await service.publishVideo(user.id, published.public_id, {});
      const noCategory = await readyDraftForPublish(user.id, {
        category_id: null,
      });
      const processing = await readyDraftForPublish(user.id, {
        status: VideoStatus.PROCESSING,
      });

      await expect(
        service.publishVideo(user.id, published.public_id, {}),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_ALREADY_PUBLISHED' });
      await expect(
        service.publishVideo(user.id, noCategory.public_id, {}),
      ).rejects.toMatchObject({ errorCode: 'CATEGORY_REQUIRED' });
      await expect(
        service.publishVideo(user.id, processing.public_id, {}),
      ).rejects.toMatchObject({ errorCode: 'VIDEO_NOT_READY' });
    });
  });
});
