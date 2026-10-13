import { BadRequestException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
import { Category } from '../categories/entities/category.entity';
import { Channel } from '../channels/entities/channel.entity';
import {
  FileTooLargeException,
  InvalidPartListException,
  InvalidPartNumberException,
  InvalidUploadStateException,
  UnsupportedMediaTypeException,
  UploadSizeMismatchException,
  VideoNotFoundException,
  VideoNotReadyException,
  CategoryNotFoundException,
  InvalidCursorException,
  ChannelNotFoundException,
  InvalidThumbnailException,
  CategoryRequiredException,
  VideoAlreadyPublishedException,
  VideoUploadInProgressException,
} from '../common/exceptions/domain.exception';
import type { VideoProcessJobData } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { VideoStatus } from './video-status.enum';
import { VideoVisibility } from './video-visibility.enum';
import { MyVideosSort, SortOrder } from './dto/list-my-videos-query.dto';
import { decodeCursor, encodeCursor } from '../common/pagination/cursor.util';
import { PublicationState } from './publication-state.util';
import { ThumbnailImageService } from './thumbnail-image.service';
import { VideosService } from './videos.service';

const config = {
  maxSizeBytes: 10737418240,
  partSizeBytes: 16777216,
  uploadAbandonDays: 1,
  thumbnailMaxBytes: 2097152,
  thumbnailMaxWidth: 1280,
  thumbnailMaxHeight: 720,
};

const queueSettings = {
  redisHost: 'redis',
  redisPort: 6379,
  videoProcessingAttempts: 3,
  videoProcessingBackoffMs: 5000,
  videoWorkerConcurrency: 2,
};

function uniqueViolation(): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key'), {
    code: '23505',
    detail: 'Key (public_id)=(AAAAAAAAAAA) already exists.',
  });
  return new QueryFailedError('INSERT', [], driverError);
}

describe('VideosService', () => {
  let thumbnails: { normalize: jest.Mock };
  let videos: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findOneBy: jest.Mock;
    findOne: jest.Mock;
    findOneOrFail: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let categories: { existsBy: jest.Mock };
  let channels: { findOneByOrFail: jest.Mock; findOneBy: jest.Mock };
  let storage: {
    putObject: jest.Mock;
    createMultipartUpload: jest.Mock;
    presignUploadPart: jest.Mock;
    listParts: jest.Mock;
    presignGetObject: jest.Mock;
    presignExpiresSeconds: number;
    completeMultipartUpload: jest.Mock;
    abortMultipartUpload: jest.Mock;
  };
  let queue: { add: jest.Mock };
  let service: VideosService;

  beforeEach(() => {
    videos = {
      create: jest.fn((fields: Partial<Video>) => fields),
      save: jest.fn((entity: Partial<Video>) => Promise.resolve(entity)),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    categories = { existsBy: jest.fn().mockResolvedValue(true) };
    channels = {
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      findOneBy: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    };
    storage = {
      putObject: jest.fn().mockResolvedValue(undefined),
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      presignUploadPart: jest
        .fn()
        .mockImplementation((_key: string, _uploadId: string, n: number) =>
          Promise.resolve(`https://storage/part-${n}`),
        ),
      listParts: jest.fn().mockResolvedValue([]),
      presignGetObject: jest.fn().mockResolvedValue('https://storage/signed'),
      presignExpiresSeconds: 900,
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };
    queue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    thumbnails = {
      normalize: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
    };
    service = new VideosService(
      videos as unknown as Repository<Video>,
      channels as unknown as Repository<Channel>,
      storage as unknown as StorageService,
      config,
      queue as unknown as Queue<VideoProcessJobData>,
      queueSettings,
      categories as unknown as Repository<Category>,
      thumbnails as unknown as ThumbnailImageService,
    );
  });

  describe('createDraft', () => {
    const dto = {
      fileName: 'aula.mp4',
      fileSize: 1073741824,
      contentType: 'video/mp4',
    };

    it('should reject a declared size above the limit', async () => {
      await expect(
        service.createDraft('user-1', { ...dto, fileSize: 10737418241 }),
      ).rejects.toBeInstanceOf(FileTooLargeException);
      expect(videos.save).not.toHaveBeenCalled();
    });

    it('should accept a declared size exactly at the limit', async () => {
      await expect(
        service.createDraft('user-1', { ...dto, fileSize: 10737418240 }),
      ).resolves.toMatchObject({ totalParts: 640 });
    });

    it('should reject a content type outside the allowed containers', async () => {
      await expect(
        service.createDraft('user-1', {
          ...dto,
          contentType: 'application/pdf',
        }),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('should default the title to the file name without extension', async () => {
      const result = await service.createDraft('user-1', dto);

      expect(result.title).toBe('aula');
      expect(result.status).toBe(VideoStatus.DRAFT);
    });

    it('should keep an informed title', async () => {
      const result = await service.createDraft('user-1', {
        ...dto,
        title: 'Minha aula',
      });

      expect(result.title).toBe('Minha aula');
    });

    it('should return an 11-character public id, part size and total parts', async () => {
      const result = await service.createDraft('user-1', dto);

      expect(result.id).toMatch(/^[0-9A-Za-z]{11}$/);
      expect(result.partSize).toBe(16777216);
      expect(result.totalParts).toBe(64);
    });

    it('should build the storage key from the internal id and the file extension', async () => {
      await service.createDraft('user-1', { ...dto, fileName: 'Aula.MOV' });

      const saved = videos.create.mock.calls[0][0] as Partial<Video>;
      expect(saved.storage_key).toBe(`videos/${saved.id}/original.mov`);
      expect(storage.createMultipartUpload).toHaveBeenCalledWith(
        saved.storage_key,
        'video/mp4',
      );
    });

    it('should fall back to the content type extension when the file name has none', async () => {
      await service.createDraft('user-1', { ...dto, fileName: 'aula' });

      const saved = videos.create.mock.calls[0][0] as Partial<Video>;
      expect(saved.storage_key).toMatch(/original\.mp4$/);
    });

    it('should retry with a new public id when the unique constraint collides', async () => {
      videos.save
        .mockRejectedValueOnce(uniqueViolation())
        .mockImplementation((entity: Partial<Video>) =>
          Promise.resolve(entity),
        );

      const result = await service.createDraft('user-1', dto);

      expect(videos.save).toHaveBeenCalledTimes(2);
      expect(result.id).toMatch(/^[0-9A-Za-z]{11}$/);
    });

    it('should give up after repeated public id collisions', async () => {
      videos.save.mockRejectedValue(uniqueViolation());

      await expect(service.createDraft('user-1', dto)).rejects.toBeInstanceOf(
        QueryFailedError,
      );
      expect(videos.save).toHaveBeenCalledTimes(5);
    });

    it('should remove the draft when the multipart upload cannot be opened', async () => {
      storage.createMultipartUpload.mockRejectedValue(
        new Error('storage down'),
      );

      await expect(service.createDraft('user-1', dto)).rejects.toThrow(
        'storage down',
      );
      expect(videos.delete).toHaveBeenCalledTimes(1);
    });

    it('should persist the upload id returned by the storage', async () => {
      await service.createDraft('user-1', dto);

      expect(videos.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) as string }),
        { upload_id: 'upload-1' },
      );
    });
  });

  describe('getPartUrls', () => {
    const draft = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.DRAFT,
      upload_id: 'upload-1',
      storage_key: 'videos/video-1/original.mp4',
      declared_size: 1073741824,
    } as Video;

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(draft);
    });

    it('should sign one URL per requested part with the storage TTL', async () => {
      const result = await service.getPartUrls('user-1', 'AAAAAAAAAAA', [1, 2]);

      expect(result).toEqual({
        urls: [
          { partNumber: 1, url: 'https://storage/part-1' },
          { partNumber: 2, url: 'https://storage/part-2' },
        ],
        expiresIn: 900,
      });
      expect(storage.presignUploadPart).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        'upload-1',
        1,
      );
    });

    it('should look the video up only within the caller channel', async () => {
      await service.getPartUrls('user-1', 'AAAAAAAAAAA', [1]);

      expect(videos.findOneBy).toHaveBeenCalledWith({
        public_id: 'AAAAAAAAAAA',
        channel_id: 'channel-1',
      });
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.getPartUrls('other-user', 'AAAAAAAAAAA', [1]),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should hide the video when the caller has no channel', async () => {
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.getPartUrls('user-1', 'AAAAAAAAAAA', [1]),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should reject a video that is no longer a draft', async () => {
      videos.findOneBy.mockResolvedValue({
        ...draft,
        status: VideoStatus.PROCESSING,
      });

      await expect(
        service.getPartUrls('user-1', 'AAAAAAAAAAA', [1]),
      ).rejects.toBeInstanceOf(InvalidUploadStateException);
    });

    it('should reject a draft without an open multipart upload', async () => {
      videos.findOneBy.mockResolvedValue({ ...draft, upload_id: null });

      await expect(
        service.getPartUrls('user-1', 'AAAAAAAAAAA', [1]),
      ).rejects.toBeInstanceOf(InvalidUploadStateException);
    });

    it.each([[0], [65], [-1]])(
      'should reject part number %i outside 1..totalParts',
      async (partNumber) => {
        await expect(
          service.getPartUrls('user-1', 'AAAAAAAAAAA', [1, partNumber]),
        ).rejects.toBeInstanceOf(InvalidPartNumberException);
        expect(storage.presignUploadPart).not.toHaveBeenCalled();
      },
    );

    it('should accept the last part number', async () => {
      await expect(
        service.getPartUrls('user-1', 'AAAAAAAAAAA', [64]),
      ).resolves.toMatchObject({ urls: [{ partNumber: 64 }] });
    });
  });

  describe('listUploadedParts', () => {
    const draft = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.DRAFT,
      upload_id: 'upload-1',
      storage_key: 'videos/video-1/original.mp4',
      declared_size: 1073741824,
    } as Video;

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(draft);
    });

    it('should return the parts stored for the open upload', async () => {
      storage.listParts.mockResolvedValue([
        { partNumber: 1, size: 5242880, eTag: '"a"' },
        { partNumber: 2, size: 1024, eTag: '"b"' },
      ]);

      const result = await service.listUploadedParts('user-1', 'AAAAAAAAAAA');

      expect(result.parts).toHaveLength(2);
      expect(storage.listParts).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        'upload-1',
      );
    });

    it('should return an empty list before any part is uploaded', async () => {
      await expect(
        service.listUploadedParts('user-1', 'AAAAAAAAAAA'),
      ).resolves.toEqual({ parts: [] });
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.listUploadedParts('other-user', 'AAAAAAAAAAA'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should reject a video that is no longer a draft', async () => {
      videos.findOneBy.mockResolvedValue({
        ...draft,
        status: VideoStatus.READY,
      });

      await expect(
        service.listUploadedParts('user-1', 'AAAAAAAAAAA'),
      ).rejects.toBeInstanceOf(InvalidUploadStateException);
      expect(storage.listParts).not.toHaveBeenCalled();
    });
  });

  describe('completeUpload', () => {
    const draft = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.DRAFT,
      upload_id: 'upload-1',
      storage_key: 'videos/video-1/original.mp4',
      declared_size: 5243904,
    } as Video;
    const stored = [
      { partNumber: 1, size: 5242880, eTag: '"etag-1"' },
      { partNumber: 2, size: 1024, eTag: '"etag-2"' },
    ];
    const submitted = {
      parts: [
        { partNumber: 1, eTag: '"etag-1"' },
        { partNumber: 2, eTag: '"etag-2"' },
      ],
    };

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(draft);
      storage.listParts.mockResolvedValue(stored);
    });

    it('should complete the multipart, mark the video processing and enqueue the job', async () => {
      const result = await service.completeUpload(
        'user-1',
        'AAAAAAAAAAA',
        submitted,
      );

      expect(result).toEqual({
        id: 'AAAAAAAAAAA',
        status: VideoStatus.PROCESSING,
      });
      expect(storage.completeMultipartUpload).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        'upload-1',
        submitted.parts,
      );
      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        {
          status: VideoStatus.PROCESSING,
          size_bytes: 5243904,
          upload_id: null,
        },
      );
      expect(queue.add).toHaveBeenCalledWith(
        'video.process',
        { videoId: 'video-1' },
        { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
      );
    });

    it('should compare ETags ignoring surrounding quotes', async () => {
      await expect(
        service.completeUpload('user-1', 'AAAAAAAAAAA', {
          parts: [
            { partNumber: 1, eTag: 'etag-1' },
            { partNumber: 2, eTag: 'etag-2' },
          ],
        }),
      ).resolves.toMatchObject({ status: VideoStatus.PROCESSING });
    });

    it.each([
      [
        'a different ETag',
        [
          { partNumber: 1, eTag: 'x' },
          { partNumber: 2, eTag: 'etag-2' },
        ],
      ],
      ['a missing part', [{ partNumber: 1, eTag: 'etag-1' }]],
      [
        'an unknown part number',
        [
          { partNumber: 1, eTag: 'etag-1' },
          { partNumber: 3, eTag: 'etag-2' },
        ],
      ],
      [
        'a duplicated part',
        [
          { partNumber: 1, eTag: 'etag-1' },
          { partNumber: 1, eTag: 'etag-1' },
        ],
      ],
    ])('should reject %s', async (_label, parts) => {
      await expect(
        service.completeUpload('user-1', 'AAAAAAAAAAA', { parts }),
      ).rejects.toBeInstanceOf(InvalidPartListException);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should abort the upload when the stored size differs from the declared size', async () => {
      storage.listParts.mockResolvedValue([
        { partNumber: 1, size: 5242880, eTag: '"etag-1"' },
        { partNumber: 2, size: 2048, eTag: '"etag-2"' },
      ]);

      await expect(
        service.completeUpload('user-1', 'AAAAAAAAAAA', submitted),
      ).rejects.toBeInstanceOf(UploadSizeMismatchException);
      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        'upload-1',
      );
      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        { upload_id: null },
      );
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('should abort the upload when the stored size exceeds the limit', async () => {
      const limited = new VideosService(
        videos as unknown as Repository<Video>,
        channels as unknown as Repository<Channel>,
        storage as unknown as StorageService,
        { ...config, maxSizeBytes: 1000 },
        queue as unknown as Queue<VideoProcessJobData>,
        queueSettings,
        categories as unknown as Repository<Category>,
        thumbnails as unknown as ThumbnailImageService,
      );

      await expect(
        limited.completeUpload('user-1', 'AAAAAAAAAAA', submitted),
      ).rejects.toBeInstanceOf(FileTooLargeException);
      expect(storage.abortMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.completeUpload('other-user', 'AAAAAAAAAAA', submitted),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should reject a video that is already processing', async () => {
      videos.findOneBy.mockResolvedValue({
        ...draft,
        status: VideoStatus.PROCESSING,
        upload_id: null,
      });

      await expect(
        service.completeUpload('user-1', 'AAAAAAAAAAA', submitted),
      ).rejects.toBeInstanceOf(InvalidUploadStateException);
    });

    it('should mark the video as failed when the job cannot be enqueued', async () => {
      queue.add.mockRejectedValue(new Error('redis down'));

      await expect(
        service.completeUpload('user-1', 'AAAAAAAAAAA', submitted),
      ).rejects.toThrow('redis down');
      expect(videos.update).toHaveBeenLastCalledWith(
        { id: 'video-1' },
        { status: VideoStatus.ERROR, error_reason: 'PROCESSING_FAILED' },
      );
    });
  });

  describe('cancelUpload', () => {
    const draft = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.DRAFT,
      upload_id: 'upload-1',
      storage_key: 'videos/video-1/original.mp4',
    } as Video;

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(draft);
    });

    it('should abort the multipart upload and delete the draft', async () => {
      await service.cancelUpload('user-1', 'AAAAAAAAAAA');

      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        'upload-1',
      );
      expect(videos.delete).toHaveBeenCalledWith({ id: 'video-1' });
    });

    it('should delete a draft that has no open multipart upload', async () => {
      videos.findOneBy.mockResolvedValue({ ...draft, upload_id: null });

      await service.cancelUpload('user-1', 'AAAAAAAAAAA');

      expect(storage.abortMultipartUpload).not.toHaveBeenCalled();
      expect(videos.delete).toHaveBeenCalledTimes(1);
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.cancelUpload('other-user', 'AAAAAAAAAAA'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(videos.delete).not.toHaveBeenCalled();
    });

    it('should reject a video that is no longer a draft', async () => {
      videos.findOneBy.mockResolvedValue({
        ...draft,
        status: VideoStatus.PROCESSING,
        upload_id: null,
      });

      await expect(
        service.cancelUpload('user-1', 'AAAAAAAAAAA'),
      ).rejects.toBeInstanceOf(InvalidUploadStateException);
      expect(videos.delete).not.toHaveBeenCalled();
    });

    it('should keep the draft when aborting the multipart fails', async () => {
      storage.abortMultipartUpload.mockRejectedValue(new Error('storage down'));

      await expect(
        service.cancelUpload('user-1', 'AAAAAAAAAAA'),
      ).rejects.toThrow('storage down');
      expect(videos.delete).not.toHaveBeenCalled();
    });
  });

  describe('getVideo', () => {
    const PUBLISHED_AT = new Date('2026-10-13T12:00:00.000Z');
    const base = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      title: 'Aula',
      description: 'Descrição',
      status: VideoStatus.READY,
      visibility: VideoVisibility.PUBLIC,
      published_at: PUBLISHED_AT,
      duration_seconds: 125.5,
      thumbnail_key: 'videos/video-1/thumbnail.jpg',
      error_reason: null,
      view_count: 0,
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
      category: { id: 'cat-1', slug: 'educacao', name: 'Educação' },
      created_at: new Date('2026-10-13T11:00:00.000Z'),
    } as unknown as Video;

    it('should return a published video to an anonymous caller with every field', async () => {
      videos.findOne.mockResolvedValue(base);

      const result = await service.getVideo('AAAAAAAAAAA');

      expect(result).toEqual({
        id: 'AAAAAAAAAAA',
        title: 'Aula',
        description: 'Descrição',
        status: VideoStatus.READY,
        publicationState: 'published',
        visibility: 'public',
        publishedAt: '2026-10-13T12:00:00.000Z',
        category: { id: 'cat-1', slug: 'educacao', name: 'Educação' },
        durationSeconds: 125.5,
        thumbnailUrl: 'https://storage/signed',
        errorReason: null,
        viewCount: 0,
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
        createdAt: '2026-10-13T11:00:00.000Z',
      });
      expect(videos.findOne).toHaveBeenCalledWith({
        where: { public_id: 'AAAAAAAAAAA' },
        relations: { category: true },
      });
    });

    it('should return null category and thumbnail when they are not set', async () => {
      videos.findOne.mockResolvedValue({
        ...base,
        category: null,
        thumbnail_key: null,
      });

      const result = await service.getVideo('AAAAAAAAAAA');

      expect(result.category).toBeNull();
      expect(result.thumbnailUrl).toBeNull();
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it('should let an anonymous caller open an unlisted published video by link', async () => {
      videos.findOne.mockResolvedValue({
        ...base,
        visibility: VideoVisibility.UNLISTED,
      });

      const result = await service.getVideo('AAAAAAAAAAA');

      expect(result.visibility).toBe('unlisted');
    });

    it('should hide a ready but unpublished video from anonymous callers', async () => {
      videos.findOne.mockResolvedValue({ ...base, published_at: null });

      await expect(service.getVideo('AAAAAAAAAAA')).rejects.toBeInstanceOf(
        VideoNotFoundException,
      );
    });

    it('should hide a ready but unpublished video from another signed-in user', async () => {
      videos.findOne.mockResolvedValue({ ...base, published_at: null });
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.getVideo('AAAAAAAAAAA', 'other-user'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(channels.findOneBy).toHaveBeenCalledWith({
        id: 'channel-1',
        user_id: 'other-user',
      });
    });

    it('should show a ready but unpublished video to its owner as unpublished', async () => {
      videos.findOne.mockResolvedValue({ ...base, published_at: null });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.publicationState).toBe('unpublished');
      expect(result.publishedAt).toBeNull();
    });

    it.each([
      [VideoStatus.DRAFT, 'uploading'],
      [VideoStatus.PROCESSING, 'processing'],
      [VideoStatus.ERROR, 'error'],
    ])(
      'should hide a %s video from anonymous callers and show it to the owner as %s',
      async (status, state) => {
        videos.findOne.mockResolvedValue({
          ...base,
          status,
          published_at: null,
        });

        await expect(service.getVideo('AAAAAAAAAAA')).rejects.toBeInstanceOf(
          VideoNotFoundException,
        );
        const result = await service.getVideo('AAAAAAAAAAA', 'user-1');
        expect(result.publicationState).toBe(state);
      },
    );

    it('should show the error reason only to the owner', async () => {
      videos.findOne.mockResolvedValue({
        ...base,
        status: VideoStatus.ERROR,
        published_at: null,
        error_reason: 'INVALID_MEDIA',
      });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.errorReason).toBe('INVALID_MEDIA');
    });

    it('should not leak the error reason of a published video', async () => {
      videos.findOne.mockResolvedValue({ ...base, error_reason: 'LEFTOVER' });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.errorReason).toBeNull();
    });

    it('should report an unknown video as not found', async () => {
      videos.findOne.mockResolvedValue(null);

      await expect(service.getVideo('ZZZZZZZZZZZ')).rejects.toBeInstanceOf(
        VideoNotFoundException,
      );
    });
  });

  describe('getPlaybackUrl', () => {
    const ready = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.READY,
      visibility: VideoVisibility.PUBLIC,
      published_at: new Date('2026-10-13T12:00:00.000Z'),
      storage_key: 'videos/video-1/original.mp4',
      file_name: 'aula.mp4',
    } as unknown as Video;

    it('should sign the original object for streaming without a download name', async () => {
      videos.findOne.mockResolvedValue(ready);

      const result = await service.getPlaybackUrl('AAAAAAAAAAA', undefined, {
        download: false,
      });

      expect(result).toEqual({ url: 'https://storage/signed', expiresIn: 900 });
      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        {},
      );
    });

    it('should pass the original file name when downloading', async () => {
      videos.findOne.mockResolvedValue(ready);

      await service.getPlaybackUrl('AAAAAAAAAAA', undefined, {
        download: true,
      });

      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        { downloadFileName: 'aula.mp4' },
      );
    });

    it('should let anonymous callers stream an unlisted published video', async () => {
      videos.findOne.mockResolvedValue({
        ...ready,
        visibility: VideoVisibility.UNLISTED,
      });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', undefined, { download: false }),
      ).resolves.toMatchObject({ url: 'https://storage/signed' });
    });

    it('should hide a ready but unpublished video from anonymous callers', async () => {
      videos.findOne.mockResolvedValue({ ...ready, published_at: null });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', undefined, { download: true }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should let the owner stream a ready but unpublished video', async () => {
      videos.findOne.mockResolvedValue({ ...ready, published_at: null });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', 'user-1', { download: false }),
      ).resolves.toMatchObject({ url: 'https://storage/signed' });
    });

    it('should tell the owner that a processing video is not ready', async () => {
      videos.findOne.mockResolvedValue({
        ...ready,
        status: VideoStatus.PROCESSING,
        published_at: null,
      });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', 'user-1', { download: false }),
      ).rejects.toBeInstanceOf(VideoNotReadyException);
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it('should hide a non-ready video from anonymous callers', async () => {
      videos.findOne.mockResolvedValue({
        ...ready,
        status: VideoStatus.PROCESSING,
        published_at: null,
      });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', undefined, { download: true }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should hide a non-ready video from another signed-in user', async () => {
      videos.findOne.mockResolvedValue({
        ...ready,
        status: VideoStatus.ERROR,
        published_at: null,
      });
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', 'other-user', {
          download: false,
        }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should report an unknown video as not found', async () => {
      videos.findOne.mockResolvedValue(null);

      await expect(
        service.getPlaybackUrl('ZZZZZZZZZZZ', undefined, { download: false }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });

  describe('updateVideo', () => {
    const owned = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.READY,
      upload_id: null,
      visibility: VideoVisibility.PUBLIC,
      published_at: null,
      view_count: 0,
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
      category: null,
      created_at: new Date('2026-10-13T11:00:00.000Z'),
    } as unknown as Video;

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(owned);
      videos.findOneOrFail.mockResolvedValue({
        ...owned,
        title: 'Novo título',
      });
    });

    it('should update only the informed fields and return the reloaded video', async () => {
      const result = await service.updateVideo('user-1', 'AAAAAAAAAAA', {
        title: 'Novo título',
        visibility: VideoVisibility.UNLISTED,
      });

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        { title: 'Novo título', visibility: VideoVisibility.UNLISTED },
      );
      expect(result.title).toBe('Novo título');
      expect(videos.findOneOrFail).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        relations: { category: true },
      });
    });

    it.each([[null], ['']])(
      'should clear the description when it is %p',
      async (value) => {
        await service.updateVideo('user-1', 'AAAAAAAAAAA', {
          description: value,
        });

        expect(videos.update).toHaveBeenCalledWith(
          { id: 'video-1' },
          { description: null },
        );
      },
    );

    it('should link an existing category', async () => {
      await service.updateVideo('user-1', 'AAAAAAAAAAA', {
        categoryId: 'cat-1',
      });

      expect(categories.existsBy).toHaveBeenCalledWith({ id: 'cat-1' });
      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        { category_id: 'cat-1' },
      );
    });

    it('should reject an unknown category without touching the video', async () => {
      categories.existsBy.mockResolvedValue(false);

      await expect(
        service.updateVideo('user-1', 'AAAAAAAAAAA', { categoryId: 'nope' }),
      ).rejects.toBeInstanceOf(CategoryNotFoundException);
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should reject an edit while the upload is still open', async () => {
      videos.findOneBy.mockResolvedValue({
        ...owned,
        status: VideoStatus.DRAFT,
        upload_id: 'upload-1',
      });

      await expect(
        service.updateVideo('user-1', 'AAAAAAAAAAA', { title: 'x' }),
      ).rejects.toBeInstanceOf(VideoUploadInProgressException);
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should allow editing a draft whose upload is no longer open', async () => {
      videos.findOneBy.mockResolvedValue({
        ...owned,
        status: VideoStatus.DRAFT,
        upload_id: null,
      });

      await expect(
        service.updateVideo('user-1', 'AAAAAAAAAAA', { title: 'x' }),
      ).resolves.toBeDefined();
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateVideo('other-user', 'AAAAAAAAAAA', { title: 'x' }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should reject a body without any field', async () => {
      await expect(
        service.updateVideo('user-1', 'AAAAAAAAAAA', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(videos.update).not.toHaveBeenCalled();
    });
  });

  describe('publishVideo', () => {
    const ready = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.READY,
      category_id: 'cat-1',
      published_at: null,
      visibility: VideoVisibility.PUBLIC,
      view_count: 0,
      like_count: 0,
      dislike_count: 0,
      comment_count: 0,
      category: { id: 'cat-1', slug: 'educacao', name: 'Educação' },
      created_at: new Date('2026-10-13T11:00:00.000Z'),
    } as unknown as Video;

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(ready);
      videos.findOneOrFail.mockResolvedValue({
        ...ready,
        published_at: new Date('2026-10-13T12:00:00.000Z'),
      });
    });

    it('should stamp published_at and return the published video', async () => {
      const result = await service.publishVideo('user-1', 'AAAAAAAAAAA', {});

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        { published_at: expect.any(Date) as Date },
      );
      expect(result.publicationState).toBe('published');
      expect(result.publishedAt).toBe('2026-10-13T12:00:00.000Z');
    });

    it('should apply the informed visibility together with the publication', async () => {
      await service.publishVideo('user-1', 'AAAAAAAAAAA', {
        visibility: VideoVisibility.UNLISTED,
      });

      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        {
          published_at: expect.any(Date) as Date,
          visibility: VideoVisibility.UNLISTED,
        },
      );
    });

    it.each([VideoStatus.DRAFT, VideoStatus.PROCESSING, VideoStatus.ERROR])(
      'should reject a %s video as not ready',
      async (status) => {
        videos.findOneBy.mockResolvedValue({ ...ready, status });

        await expect(
          service.publishVideo('user-1', 'AAAAAAAAAAA', {}),
        ).rejects.toBeInstanceOf(VideoNotReadyException);
        expect(videos.update).not.toHaveBeenCalled();
      },
    );

    it('should reject a video that is already published', async () => {
      videos.findOneBy.mockResolvedValue({
        ...ready,
        published_at: new Date(),
      });

      await expect(
        service.publishVideo('user-1', 'AAAAAAAAAAA', {}),
      ).rejects.toBeInstanceOf(VideoAlreadyPublishedException);
    });

    it('should require a category', async () => {
      videos.findOneBy.mockResolvedValue({ ...ready, category_id: null });

      await expect(
        service.publishVideo('user-1', 'AAAAAAAAAAA', {}),
      ).rejects.toBeInstanceOf(CategoryRequiredException);
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.publishVideo('other-user', 'AAAAAAAAAAA', {}),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });

  describe('replaceThumbnail', () => {
    const owned = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      status: VideoStatus.READY,
      upload_id: null,
    } as unknown as Video;
    const file = { buffer: Buffer.from('png') };

    beforeEach(() => {
      videos.findOneBy.mockResolvedValue(owned);
      storage.presignGetObject.mockResolvedValue('https://signed');
    });

    it('should store the normalized image and point thumbnail_key at it', async () => {
      const result = await service.replaceThumbnail(
        'user-1',
        'AAAAAAAAAAA',
        file,
      );

      expect(thumbnails.normalize).toHaveBeenCalledWith(file.buffer);
      expect(storage.putObject).toHaveBeenCalledWith(
        'videos/video-1/thumbnail-custom.jpg',
        Buffer.from('jpeg'),
        'image/jpeg',
      );
      expect(videos.update).toHaveBeenCalledWith(
        { id: 'video-1' },
        { thumbnail_key: 'videos/video-1/thumbnail-custom.jpg' },
      );
      expect(result).toEqual({ thumbnailUrl: 'https://signed' });
    });

    it('should reject a request without a file', async () => {
      await expect(
        service.replaceThumbnail('user-1', 'AAAAAAAAAAA', undefined),
      ).rejects.toBeInstanceOf(InvalidThumbnailException);
      expect(storage.putObject).not.toHaveBeenCalled();
    });

    it('should not touch storage when the image is invalid', async () => {
      thumbnails.normalize.mockRejectedValue(new InvalidThumbnailException());

      await expect(
        service.replaceThumbnail('user-1', 'AAAAAAAAAAA', file),
      ).rejects.toBeInstanceOf(InvalidThumbnailException);
      expect(storage.putObject).not.toHaveBeenCalled();
      expect(videos.update).not.toHaveBeenCalled();
    });

    it('should reject a draft with an open upload', async () => {
      videos.findOneBy.mockResolvedValue({
        ...owned,
        status: VideoStatus.DRAFT,
        upload_id: 'upload-1',
      });

      await expect(
        service.replaceThumbnail('user-1', 'AAAAAAAAAAA', file),
      ).rejects.toBeInstanceOf(VideoUploadInProgressException);
    });

    it('should hide a video the caller does not own', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.replaceThumbnail('other-user', 'AAAAAAAAAAA', file),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });

  describe('listMyVideos', () => {
    function makeQb(result: [unknown[], number]) {
      const qb: Record<string, jest.Mock> = {};
      for (const name of [
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'skip',
        'take',
      ]) {
        qb[name] = jest.fn().mockReturnValue(qb);
      }
      qb.getManyAndCount = jest.fn().mockResolvedValue(result);
      return qb;
    }

    const row = (overrides: Record<string, unknown> = {}) => ({
      public_id: 'AAAAAAAAAAA',
      title: 'Aula',
      thumbnail_key: null,
      status: VideoStatus.READY,
      visibility: VideoVisibility.PUBLIC,
      published_at: null,
      created_at: new Date('2026-10-13T10:00:00.000Z'),
      view_count: 1,
      like_count: 2,
      dislike_count: 3,
      comment_count: 4,
      ...overrides,
    });

    beforeEach(() => {
      channels.findOneBy.mockResolvedValue({ id: 'channel-1' });
    });

    it.each([
      ['uploading', [{ status: VideoStatus.DRAFT }], false],
      ['processing', [{ status: VideoStatus.PROCESSING }], false],
      ['error', [{ status: VideoStatus.ERROR }], false],
      ['unpublished', [{ status: VideoStatus.READY }], 'IS NULL'],
      ['published', [{ status: VideoStatus.READY }], 'IS NOT NULL'],
    ])(
      'should map publicationState %s to status/published_at conditions',
      async (state, [status], publishedAtCondition) => {
        const qb = makeQb([[], 0]);
        videos.createQueryBuilder = jest.fn().mockReturnValue(qb);

        await service.listMyVideos('user-1', {
          page: 1,
          pageSize: 20,
          sort: MyVideosSort.CREATED_AT,
          order: SortOrder.DESC,
          publicationState: state as PublicationState,
        });

        expect(qb.andWhere).toHaveBeenCalledWith(
          'video.status = :status',
          status,
        );
        if (publishedAtCondition) {
          expect(qb.andWhere).toHaveBeenCalledWith(
            `video.published_at ${publishedAtCondition}`,
          );
        }
      },
    );

    it('should order by the whitelisted column and paginate with skip/take', async () => {
      const qb = makeQb([[], 0]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);

      await service.listMyVideos('user-1', {
        page: 3,
        pageSize: 10,
        sort: MyVideosSort.VIEW_COUNT,
        order: SortOrder.ASC,
      });

      expect(qb.orderBy).toHaveBeenCalledWith(
        'video.view_count',
        'ASC',
        'NULLS LAST',
      );
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(10);
    });

    it('should build the page with derived state and signed thumbnail', async () => {
      const qb = makeQb([
        [row({ thumbnail_key: 'videos/x/thumbnail.jpg' }), row()],
        7,
      ]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);
      storage.presignGetObject.mockResolvedValue('https://signed');

      const page = await service.listMyVideos('user-1', {
        page: 1,
        pageSize: 20,
        sort: MyVideosSort.CREATED_AT,
        order: SortOrder.DESC,
      });

      expect(page).toMatchObject({ page: 1, pageSize: 20, total: 7 });
      expect(page.items[0]).toMatchObject({
        id: 'AAAAAAAAAAA',
        thumbnailUrl: 'https://signed',
        publicationState: 'unpublished',
        viewCount: 1,
        dislikeCount: 3,
      });
      expect(page.items[1].thumbnailUrl).toBeNull();
    });

    it('should fail when the user has no channel', async () => {
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.listMyVideos('user-1', {
          page: 1,
          pageSize: 20,
          sort: MyVideosSort.CREATED_AT,
          order: SortOrder.DESC,
        }),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
    });
  });

  describe('listChannelVideos', () => {
    function makeQb(rows: unknown[]) {
      const qb: Record<string, jest.Mock> = {};
      for (const name of [
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'limit',
      ]) {
        qb[name] = jest.fn().mockReturnValue(qb);
      }
      qb.getMany = jest.fn().mockResolvedValue(rows);
      return qb;
    }

    const row = (n: number) => ({
      id: `3f2b8a52-7c1d-4e0a-9d55-1a2b3c4d5e0${n}`,
      public_id: `PUBLICID000${n}`,
      title: `Video ${n}`,
      thumbnail_key: null,
      duration_seconds: 60,
      published_at: new Date(`2026-10-1${n}T10:00:00.000Z`),
      view_count: n,
    });

    beforeEach(() => {
      channels.findOneBy.mockResolvedValue({ id: 'channel-1' });
    });

    it('should only query ready, published and public videos of the channel', async () => {
      const qb = makeQb([]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const page = await service.listChannelVideos('nick', { limit: 24 });

      expect(qb.andWhere).toHaveBeenCalledWith('video.status = :status', {
        status: VideoStatus.READY,
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'video.published_at IS NOT NULL',
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'video.visibility = :visibility',
        {
          visibility: VideoVisibility.PUBLIC,
        },
      );
      expect(page).toEqual({ items: [], nextCursor: null });
    });

    it('should fetch limit + 1 rows and expose a nextCursor when there are more', async () => {
      const qb = makeQb([row(3), row(2), row(1)]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const page = await service.listChannelVideos('nick', { limit: 2 });

      expect(qb.limit).toHaveBeenCalledWith(3);
      expect(page.items.map((i) => i.id)).toEqual([
        'PUBLICID0003',
        'PUBLICID0002',
      ]);
      expect(decodeCursor(page.nextCursor!)).toEqual({
        publishedAt: row(2).published_at,
        id: row(2).id,
      });
    });

    it('should return a null nextCursor on the last page', async () => {
      const qb = makeQb([row(2), row(1)]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);

      const page = await service.listChannelVideos('nick', { limit: 2 });

      expect(page.items).toHaveLength(2);
      expect(page.nextCursor).toBeNull();
    });

    it('should apply the cursor as a keyset condition', async () => {
      const qb = makeQb([]);
      videos.createQueryBuilder = jest.fn().mockReturnValue(qb);
      const cursor = encodeCursor({
        publishedAt: row(2).published_at,
        id: row(2).id,
      });

      await service.listChannelVideos('nick', { limit: 24, cursor });

      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('< (:publishedAt, :cursorId)'),
        { publishedAt: row(2).published_at, cursorId: row(2).id },
      );
    });

    it('should reject a malformed cursor and an unknown channel', async () => {
      await expect(
        service.listChannelVideos('nick', { limit: 24, cursor: 'invalido' }),
      ).rejects.toBeInstanceOf(InvalidCursorException);

      channels.findOneBy.mockResolvedValue(null);
      await expect(
        service.listChannelVideos('nope', { limit: 24 }),
      ).rejects.toBeInstanceOf(ChannelNotFoundException);
    });
  });
});
