import request from 'supertest';
import { Category } from '../src/categories/entities/category.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type VideoBody = {
  publicationState: string;
  publishedAt: string | null;
  visibility: string;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-publish (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let categoryId: string;
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
    categoryId = (
      await ctx.dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'educacao' })
    ).id;
  });

  const readyUnpublished = (overrides = {}) =>
    insertVideo(ctx, channelId, {
      status: VideoStatus.READY,
      published_at: null,
      category_id: categoryId,
      ...overrides,
    });

  const publish = (publicId: string, body: unknown = {}, token?: string) => {
    const req = request(ctx.app.getHttpServer()).post(
      `/videos/${publicId}/publish`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body as object);
  };

  describe('1. Publicação', () => {
    it('1.1 publish-ready-video', async () => {
      const video = await readyUnpublished();

      const res = await publish(video.public_id, {}, ownerToken).expect(200);

      const body = bodyOf<VideoBody>(res);
      expect(body.publicationState).toBe('published');
      expect(body.publishedAt).toEqual(expect.any(String));
    });

    it('1.2 publish-as-unlisted', async () => {
      const video = await readyUnpublished();

      const res = await publish(
        video.public_id,
        { visibility: 'unlisted' },
        ownerToken,
      ).expect(200);

      expect(bodyOf<VideoBody>(res).visibility).toBe('unlisted');
    });

    it('1.3 access-before-and-after-publish', async () => {
      const video = await readyUnpublished();

      await request(ctx.app.getHttpServer())
        .get(`/videos/${video.public_id}`)
        .expect(404);
      await publish(video.public_id, {}, ownerToken).expect(200);
      await request(ctx.app.getHttpServer())
        .get(`/videos/${video.public_id}`)
        .expect(200);
    });

    it('1.4 reject-missing-category', async () => {
      const video = await readyUnpublished({ category_id: null });

      const res = await publish(video.public_id, {}, ownerToken).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('CATEGORY_REQUIRED');
    });

    it('1.5 reject-not-ready', async () => {
      const video = await readyUnpublished({ status: VideoStatus.PROCESSING });

      const res = await publish(video.public_id, {}, ownerToken).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_READY');
    });

    it('1.6 reject-already-published', async () => {
      const video = await readyUnpublished({ published_at: new Date() });

      const res = await publish(video.public_id, {}, ownerToken).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_ALREADY_PUBLISHED');
    });

    it('1.7 reject-invalid-visibility', async () => {
      const video = await readyUnpublished();

      const res = await publish(
        video.public_id,
        { visibility: 'private' },
        ownerToken,
      ).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.8 hide-video-from-non-owner', async () => {
      const video = await readyUnpublished();

      const res = await publish(video.public_id, {}, otherToken).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.9 reject-unauthenticated', async () => {
      const video = await readyUnpublished();

      await publish(video.public_id).expect(401);
    });
  });
});
