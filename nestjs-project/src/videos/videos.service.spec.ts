import type { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
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
} from '../common/exceptions/domain.exception';
import type { VideoProcessJobData } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { Video } from './entities/video.entity';
import { VideoStatus } from './video-status.enum';
import { VideosService } from './videos.service';

const config = {
  maxSizeBytes: 10737418240,
  partSizeBytes: 16777216,
  uploadAbandonDays: 1,
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
  let videos: {
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findOneBy: jest.Mock;
  };
  let channels: { findOneByOrFail: jest.Mock; findOneBy: jest.Mock };
  let storage: {
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
    };
    channels = {
      findOneByOrFail: jest.fn().mockResolvedValue({ id: 'channel-1' }),
      findOneBy: jest.fn().mockResolvedValue({ id: 'channel-1' }),
    };
    storage = {
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
    service = new VideosService(
      videos as unknown as Repository<Video>,
      channels as unknown as Repository<Channel>,
      storage as unknown as StorageService,
      config,
      queue as unknown as Queue<VideoProcessJobData>,
      queueSettings,
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
    const base = {
      id: 'video-1',
      public_id: 'AAAAAAAAAAA',
      channel_id: 'channel-1',
      title: 'Aula',
      status: VideoStatus.READY,
      duration_seconds: 125.5,
      thumbnail_key: 'videos/video-1/thumbnail.jpg',
      error_reason: null,
      created_at: new Date('2026-10-13T12:00:00.000Z'),
    } as Video;

    it('should return a ready video to an anonymous caller', async () => {
      videos.findOneBy.mockResolvedValue(base);

      const result = await service.getVideo('AAAAAAAAAAA');

      expect(result).toEqual({
        id: 'AAAAAAAAAAA',
        title: 'Aula',
        status: VideoStatus.READY,
        durationSeconds: 125.5,
        thumbnailUrl: 'https://storage/signed',
        errorReason: null,
        createdAt: '2026-10-13T12:00:00.000Z',
      });
      expect(channels.findOneBy).not.toHaveBeenCalled();
    });

    it('should return no thumbnail URL before the thumbnail exists', async () => {
      videos.findOneBy.mockResolvedValue({ ...base, thumbnail_key: null });

      const result = await service.getVideo('AAAAAAAAAAA');

      expect(result.thumbnailUrl).toBeNull();
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it.each([VideoStatus.DRAFT, VideoStatus.PROCESSING, VideoStatus.ERROR])(
      'should hide a %s video from anonymous callers',
      async (status) => {
        videos.findOneBy.mockResolvedValue({ ...base, status });

        await expect(service.getVideo('AAAAAAAAAAA')).rejects.toBeInstanceOf(
          VideoNotFoundException,
        );
      },
    );

    it('should hide a non-ready video from another signed-in user', async () => {
      videos.findOneBy.mockResolvedValue({
        ...base,
        status: VideoStatus.DRAFT,
      });
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.getVideo('AAAAAAAAAAA', 'other-user'),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
      expect(channels.findOneBy).toHaveBeenCalledWith({
        id: 'channel-1',
        user_id: 'other-user',
      });
    });

    it('should show a processing video to its owner', async () => {
      videos.findOneBy.mockResolvedValue({
        ...base,
        status: VideoStatus.PROCESSING,
        duration_seconds: null,
        thumbnail_key: null,
      });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.status).toBe(VideoStatus.PROCESSING);
    });

    it('should show the error reason only to the owner', async () => {
      videos.findOneBy.mockResolvedValue({
        ...base,
        status: VideoStatus.ERROR,
        error_reason: 'INVALID_MEDIA',
      });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.errorReason).toBe('INVALID_MEDIA');
    });

    it('should not leak the error reason of a ready video', async () => {
      videos.findOneBy.mockResolvedValue({ ...base, error_reason: 'LEFTOVER' });

      const result = await service.getVideo('AAAAAAAAAAA', 'user-1');

      expect(result.errorReason).toBeNull();
    });

    it('should report an unknown video as not found', async () => {
      videos.findOneBy.mockResolvedValue(null);

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
      storage_key: 'videos/video-1/original.mp4',
      file_name: 'aula.mp4',
    } as Video;

    it('should sign the original object for streaming without a download name', async () => {
      videos.findOneBy.mockResolvedValue(ready);

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
      videos.findOneBy.mockResolvedValue(ready);

      await service.getPlaybackUrl('AAAAAAAAAAA', undefined, {
        download: true,
      });

      expect(storage.presignGetObject).toHaveBeenCalledWith(
        'videos/video-1/original.mp4',
        { downloadFileName: 'aula.mp4' },
      );
    });

    it('should tell the owner that a processing video is not ready', async () => {
      videos.findOneBy.mockResolvedValue({
        ...ready,
        status: VideoStatus.PROCESSING,
      });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', 'user-1', { download: false }),
      ).rejects.toBeInstanceOf(VideoNotReadyException);
      expect(storage.presignGetObject).not.toHaveBeenCalled();
    });

    it('should hide a non-ready video from anonymous callers', async () => {
      videos.findOneBy.mockResolvedValue({
        ...ready,
        status: VideoStatus.PROCESSING,
      });

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', undefined, { download: true }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should hide a non-ready video from another signed-in user', async () => {
      videos.findOneBy.mockResolvedValue({
        ...ready,
        status: VideoStatus.ERROR,
      });
      channels.findOneBy.mockResolvedValue(null);

      await expect(
        service.getPlaybackUrl('AAAAAAAAAAA', 'other-user', {
          download: false,
        }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });

    it('should report an unknown video as not found', async () => {
      videos.findOneBy.mockResolvedValue(null);

      await expect(
        service.getPlaybackUrl('ZZZZZZZZZZZ', undefined, { download: false }),
      ).rejects.toBeInstanceOf(VideoNotFoundException);
    });
  });
});
