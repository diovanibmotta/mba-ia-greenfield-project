import { getQueueToken } from '@nestjs/bullmq';
import type { ConfigType } from '@nestjs/config';
import type { Queue } from 'bullmq';
import request from 'supertest';
import videoConfig from '../src/config/video.config';
import {
  VIDEO_PROCESS_JOB,
  VIDEO_PROCESSING_QUEUE,
} from '../src/queue/queue.constants';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  createUploadedDraft,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type CompleteBody = { id: string; status: string };

const MIB = 1024 * 1024;

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-complete (e2e)', () => {
  let ctx: VideoE2eContext;
  let queue: Queue;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
    queue = ctx.app.get(getQueueToken(VIDEO_PROCESSING_QUEUE));
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    await queue.obliterate({ force: true });
    ownerToken = (await ctx.createOwner()).token;
    otherToken = (await ctx.createOwner()).token;
  });

  const complete = (
    publicId: string,
    token: string | undefined,
    parts: unknown,
  ) => {
    const req = request(ctx.app.getHttpServer()).post(
      `/videos/${publicId}/upload/complete`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ parts });
  };

  describe('1. Finalização do upload', () => {
    it('1.1 complete-upload-and-enqueue', async () => {
      const { publicId, parts } = await createUploadedDraft(ctx, ownerToken, [
        5 * MIB,
        12 * MIB,
      ]);

      const res = await complete(publicId, ownerToken, parts).expect(202);

      expect(bodyOf<CompleteBody>(res)).toEqual({
        id: publicId,
        status: 'processando',
      });
      const row = await ctx.dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: publicId });
      expect(row.size_bytes).toBe(17 * MIB);
      expect(row.status).toBe(VideoStatus.PROCESSING);
      expect(row.upload_id).toBeNull();
      const jobs = await queue.getJobs(['waiting', 'delayed']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].name).toBe(VIDEO_PROCESS_JOB);
      expect(jobs[0].data).toEqual({ videoId: row.id });
      expect(jobs[0].opts.attempts).toBe(3);
    });

    it('1.2 reject-size-mismatch', async () => {
      const { publicId, parts } = await createUploadedDraft(
        ctx,
        ownerToken,
        [5 * MIB, 12 * MIB + 1024],
        17 * MIB,
      );
      const row = await ctx.dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: publicId });

      const res = await complete(publicId, ownerToken, parts).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('UPLOAD_SIZE_MISMATCH');
      await expect(
        ctx.storage.listParts(row.storage_key, row.upload_id!),
      ).rejects.toMatchObject({ name: 'NoSuchUpload' });
    });

    it('1.3 reject-file-too-large', async () => {
      const limits = ctx.app.get<ConfigType<typeof videoConfig>>(
        videoConfig.KEY,
      );
      const original = limits.maxSizeBytes;
      limits.maxSizeBytes = 6 * MIB;
      try {
        const { publicId, parts } = await createUploadedDraft(
          ctx,
          ownerToken,
          [7 * MIB],
          5 * MIB,
        );
        const row = await ctx.dataSource
          .getRepository(Video)
          .findOneByOrFail({ public_id: publicId });

        const res = await complete(publicId, ownerToken, parts).expect(400);

        expect(bodyOf<ErrorBody>(res).error).toBe('FILE_TOO_LARGE');
        await expect(
          ctx.storage.listParts(row.storage_key, row.upload_id!),
        ).rejects.toMatchObject({ name: 'NoSuchUpload' });
      } finally {
        limits.maxSizeBytes = original;
      }
    });

    it('1.4 reject-invalid-part-list', async () => {
      const { publicId, parts } = await createUploadedDraft(ctx, ownerToken, [
        5 * MIB,
        12 * MIB,
      ]);
      const tampered = [{ ...parts[0], eTag: '"not-the-real-etag"' }, parts[1]];

      const res = await complete(publicId, ownerToken, tampered).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_PART_LIST');
    });

    it('1.5 hide-video-from-non-owner', async () => {
      const { publicId, parts } = await createUploadedDraft(ctx, ownerToken, [
        5 * MIB,
        12 * MIB,
      ]);

      const res = await complete(publicId, otherToken, parts).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.6 reject-already-processing', async () => {
      const { publicId, parts } = await createUploadedDraft(ctx, ownerToken, [
        5 * MIB,
        12 * MIB,
      ]);
      await complete(publicId, ownerToken, parts).expect(202);

      const res = await complete(publicId, ownerToken, parts).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_UPLOAD_STATE');
    });
  });
});
