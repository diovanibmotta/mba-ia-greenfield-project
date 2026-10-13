import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type ErrorBody = { error: string };
type DraftBody = { id: string };
type PartUrlsBody = { urls: { partNumber: number; url: string }[] };
type PartsBody = {
  parts: { partNumber: number; size: number; eTag: string }[];
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-list-parts (e2e)', () => {
  let ctx: VideoE2eContext;
  let ownerToken: string;
  let otherToken: string;
  let publicId: string;

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
  });

  const listParts = (token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(
      `/videos/${publicId}/upload/parts`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  describe('1. Listagem de partes', () => {
    it('1.1 list-parts-empty', async () => {
      const res = await listParts(ownerToken).expect(200);

      expect(bodyOf<PartsBody>(res).parts).toEqual([]);
    });

    it('1.2 list-uploaded-parts', async () => {
      const urlsRes = await request(ctx.app.getHttpServer())
        .post(`/videos/${publicId}/upload/part-urls`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ partNumbers: [1, 2] })
        .expect(200);
      for (const { partNumber, url } of bodyOf<PartUrlsBody>(urlsRes).urls) {
        const size = partNumber === 1 ? 5 * 1024 * 1024 : 1024;
        const put = await fetch(url, {
          method: 'PUT',
          body: new Blob([new Uint8Array(size).fill(partNumber)]),
        });
        expect(put.status).toBe(200);
      }

      const res = await listParts(ownerToken).expect(200);

      const { parts } = bodyOf<PartsBody>(res);
      expect(parts).toHaveLength(2);
      for (const part of parts) {
        expect(part).toEqual({
          partNumber: expect.any(Number) as number,
          size: expect.any(Number) as number,
          eTag: expect.any(String) as string,
        });
      }
    });

    it('1.3 hide-video-from-non-owner', async () => {
      const res = await listParts(otherToken).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.4 reject-non-draft-state', async () => {
      await ctx.dataSource
        .getRepository(Video)
        .update({ public_id: publicId }, { status: VideoStatus.PROCESSING });

      const res = await listParts(ownerToken).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_UPLOAD_STATE');
    });

    it('1.5 reject-unauthenticated', async () => {
      await listParts().expect(401);
    });
  });
});
