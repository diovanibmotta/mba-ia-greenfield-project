import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type UrlBody = { url: string; expiresIn: number };

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

const OBJECT_SIZE = 4096;

describe('videos-download (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let ownerToken: string;

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
  });

  const download = (publicId: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(
      `/videos/${publicId}/download`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  describe('1. URL de download', () => {
    it('1.1 anonymous-gets-download-url', async () => {
      const key = 'videos/e2e-download/original.mp4';
      await ctx.storage.putObject(
        key,
        Buffer.alloc(OBJECT_SIZE, 1),
        'video/mp4',
      );
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        storage_key: key,
        file_name: 'aula.mp4',
        size_bytes: OBJECT_SIZE,
      });

      const res = await download(video.public_id).expect(200);

      const body = bodyOf<UrlBody>(res);
      expect(body.expiresIn).toBeGreaterThan(0);
      const file = await fetch(body.url);
      expect(file.headers.get('content-disposition')).toBe(
        'attachment; filename="aula.mp4"',
      );
      expect((await file.arrayBuffer()).byteLength).toBe(OBJECT_SIZE);
    });

    it('1.2 owner-gets-not-ready', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.PROCESSING,
      });

      const res = await download(video.public_id, ownerToken).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_READY');
    });

    it('1.3 anonymous-cannot-download-processing-video', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.PROCESSING,
      });

      const res = await download(video.public_id).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });
  });
});
