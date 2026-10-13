import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type ErrorBody = { error: string };
type DraftBody = { id: string; totalParts: number };
type PartUrlsBody = {
  urls: { partNumber: number; url: string }[];
  expiresIn: number;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-part-urls (e2e)', () => {
  let ctx: VideoE2eContext;
  let ownerToken: string;
  let otherToken: string;
  let publicId: string;
  let totalParts: number;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    ownerToken = (await ctx.createOwner()).token;
    otherToken = (await ctx.createOwner()).token;
    const res = await request(ctx.app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      })
      .expect(201);
    publicId = bodyOf<DraftBody>(res).id;
    totalParts = bodyOf<DraftBody>(res).totalParts;
  });

  const partUrls = (token: string | undefined, partNumbers: unknown) => {
    const req = request(ctx.app.getHttpServer()).post(
      `/videos/${publicId}/upload/part-urls`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ partNumbers });
  };

  describe('1. Emissão de URLs de parte', () => {
    it('1.1 issue-part-urls-and-upload', async () => {
      const res = await partUrls(ownerToken, [1, 2]).expect(200);

      const body = bodyOf<PartUrlsBody>(res);
      expect(body.urls).toHaveLength(2);
      expect(body.expiresIn).toBeGreaterThan(0);

      const put = await fetch(body.urls[0].url, {
        method: 'PUT',
        body: new Blob([new Uint8Array(5 * 1024 * 1024).fill(1)]),
      });
      expect(put.status).toBe(200);
      expect(put.headers.get('etag')).toBeTruthy();
    });

    it('1.2 reject-invalid-part-number', async () => {
      for (const invalid of [0, totalParts + 1]) {
        const res = await partUrls(ownerToken, [invalid]).expect(400);
        expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_PART_NUMBER');
      }
    });

    it('1.3 hide-video-from-non-owner', async () => {
      const res = await partUrls(otherToken, [1]).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.4 reject-non-draft-state', async () => {
      await ctx.dataSource
        .getRepository(Video)
        .update({ public_id: publicId }, { status: VideoStatus.PROCESSING });

      const res = await partUrls(ownerToken, [1]).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_UPLOAD_STATE');
    });

    it('1.5 reject-too-many-items', async () => {
      const tooMany = Array.from({ length: 101 }, (_, i) => i + 1);

      const res = await partUrls(ownerToken, tooMany).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.6 reject-unauthenticated', async () => {
      await partUrls(undefined, [1]).expect(401);
    });
  });
});
