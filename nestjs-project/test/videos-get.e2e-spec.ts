import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type VideoBody = {
  id: string;
  status: string;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  errorReason: string | null;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-get (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let ownerToken: string;
  let otherToken: string;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    const owner = await ctx.createOwner();
    channelId = owner.channel.id;
    ownerToken = owner.token;
    otherToken = (await ctx.createOwner()).token;
  });

  const get = (publicId: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(`/videos/${publicId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  describe('1. Consulta de vídeo', () => {
    it('1.1 anonymous-reads-ready-video', async () => {
      const key = 'videos/e2e-get/thumbnail.jpg';
      await ctx.storage.putObject(key, Buffer.from([0xff, 0xd8]), 'image/jpeg');
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        duration_seconds: 42.5,
        thumbnail_key: key,
      });

      const res = await get(video.public_id).expect(200);

      const body = bodyOf<VideoBody>(res);
      expect(body).toMatchObject({
        id: video.public_id,
        status: 'pronto',
        durationSeconds: 42.5,
      });
      expect(body.thumbnailUrl).toEqual(expect.any(String));
    });

    it('1.2 anonymous-cannot-read-processing-video', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.PROCESSING,
      });

      const res = await get(video.public_id).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.3 owner-reads-processing-video', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.PROCESSING,
      });

      const res = await get(video.public_id, ownerToken).expect(200);

      expect(bodyOf<VideoBody>(res).status).toBe('processando');
    });

    it('1.4 owner-reads-error-reason', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.ERROR,
        error_reason: 'INVALID_MEDIA',
      });

      const res = await get(video.public_id, ownerToken).expect(200);

      expect(bodyOf<VideoBody>(res).errorReason).toBe('INVALID_MEDIA');
    });

    it('1.5 other-user-cannot-read-draft', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.DRAFT,
      });

      const res = await get(video.public_id, otherToken).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.6 unknown-video', async () => {
      const res = await get('ZZZZZZZZZZZ').expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.7 invalid-bearer-treated-as-anonymous', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
      });

      await get(video.public_id, 'not-a-real-token').expect(200);
    });
  });
});
