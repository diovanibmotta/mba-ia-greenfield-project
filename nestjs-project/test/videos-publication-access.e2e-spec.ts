import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import { VideoVisibility } from '../src/videos/video-visibility.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type VideoBody = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  publicationState: string;
  visibility: string;
  publishedAt: string | null;
  category: unknown;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-publication-access (e2e)', () => {
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

  const get = (path: string, token?: string) => {
    const req = request(ctx.app.getHttpServer()).get(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  describe('1. Acesso por publicação', () => {
    it('1.1 anonymous-reads-unlisted-published', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.UNLISTED,
        published_at: new Date(),
      });

      const res = await get(`/videos/${video.public_id}`).expect(200);

      expect(bodyOf<VideoBody>(res).visibility).toBe('unlisted');
    });

    it('1.2 anonymous-cannot-read-unpublished-ready', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: null,
      });

      const res = await get(`/videos/${video.public_id}`).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.3 owner-reads-unpublished-ready', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: null,
      });

      const res = await get(`/videos/${video.public_id}`, ownerToken).expect(
        200,
      );

      expect(bodyOf<VideoBody>(res).publicationState).toBe('unpublished');
    });

    it('1.4 response-includes-new-fields', async () => {
      const created = await request(ctx.app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          fileName: 'aula.mp4',
          fileSize: 1073741824,
          contentType: 'video/mp4',
        })
        .expect(201);
      const publicId = bodyOf<{ id: string }>(created).id;

      const res = await get(`/videos/${publicId}`, ownerToken).expect(200);

      const body = bodyOf<VideoBody>(res);
      expect(body).toMatchObject({
        description: null,
        visibility: 'public',
        publishedAt: null,
        category: null,
        viewCount: 0,
        likeCount: 0,
        dislikeCount: 0,
        commentCount: 0,
      });
    });

    it('1.5 publication-state-per-status', async () => {
      const cases: [VideoStatus, Date | null, string][] = [
        [VideoStatus.PROCESSING, null, 'processing'],
        [VideoStatus.ERROR, null, 'error'],
        [VideoStatus.DRAFT, null, 'uploading'],
        [VideoStatus.READY, new Date(), 'published'],
      ];

      for (const [status, publishedAt, expected] of cases) {
        const video = await insertVideo(ctx, channelId, {
          status,
          published_at: publishedAt,
        });

        const res = await get(`/videos/${video.public_id}`, ownerToken).expect(
          200,
        );

        expect(bodyOf<VideoBody>(res).publicationState).toBe(expected);
      }
    });

    it('1.6 anonymous-streams-unlisted-published', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        visibility: VideoVisibility.UNLISTED,
        published_at: new Date(),
      });

      const res = await get(`/videos/${video.public_id}/stream`).expect(200);

      const body = bodyOf<{ url: string; expiresIn: number }>(res);
      expect(body.url).toEqual(expect.any(String));
      expect(body.expiresIn).toBeGreaterThan(0);
    });

    it('1.7 stream-unpublished-ready', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: null,
      });

      await get(`/videos/${video.public_id}/stream`).expect(404);
      await get(`/videos/${video.public_id}/stream`, otherToken).expect(404);
      await get(`/videos/${video.public_id}/stream`, ownerToken).expect(200);
    });

    it('1.8 anonymous-cannot-download-unpublished', async () => {
      const video = await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: null,
      });

      const res = await get(`/videos/${video.public_id}/download`).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });
  });
});
