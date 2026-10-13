import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type Item = {
  id: string;
  title: string;
  status: string;
  publicationState: string;
  visibility: string;
  publishedAt: string | null;
  viewCount: number;
  likeCount: number;
  dislikeCount: number;
  commentCount: number;
  createdAt: string;
};
type PageBody = {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('me-videos (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let token: string;
  let otherChannelId: string;

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
    token = owner.token;
    otherChannelId = (await ctx.createOwner()).channel.id;
  });

  const list = (query = '', auth = token) => {
    const req = request(ctx.app.getHttpServer()).get(`/me/videos${query}`);
    if (auth) req.set('Authorization', `Bearer ${auth}`);
    return req;
  };

  async function seedFive() {
    for (let i = 0; i < 5; i++) {
      await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        title: `Video ${i}`,
        view_count: 10 - i,
        published_at: i < 3 ? new Date() : null,
        created_at: new Date(2026, 9, 1 + i),
      });
    }
  }

  describe('1. Painel do canal', () => {
    it('1.1 list-defaults', async () => {
      await seedFive();

      const res = await list().expect(200);

      const body = bodyOf<PageBody>(res);
      expect(body).toMatchObject({ page: 1, pageSize: 20, total: 5 });
      expect(body.items.map((i) => i.title)).toEqual([
        'Video 4',
        'Video 3',
        'Video 2',
        'Video 1',
        'Video 0',
      ]);
    });

    it('1.2 only-own-videos', async () => {
      await seedFive();
      await insertVideo(ctx, otherChannelId, { status: VideoStatus.READY });

      const res = await list().expect(200);

      expect(bodyOf<PageBody>(res).total).toBe(5);
    });

    it('1.3 sort-by-view-count', async () => {
      await seedFive();

      const res = await list('?sort=viewCount&order=asc').expect(200);

      const counts = bodyOf<PageBody>(res).items.map((i) => i.viewCount);
      expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });

    it('1.4 paginate', async () => {
      await seedFive();

      const res = await list('?pageSize=2&page=2').expect(200);

      const body = bodyOf<PageBody>(res);
      expect(body.items).toHaveLength(2);
      expect(body.total).toBe(5);
    });

    it('1.5 filter-unpublished', async () => {
      await seedFive();
      await insertVideo(ctx, channelId, { status: VideoStatus.PROCESSING });

      const res = await list('?publicationState=unpublished').expect(200);

      const body = bodyOf<PageBody>(res);
      expect(body.total).toBe(2);
      expect(body.items.every((i) => i.publishedAt === null)).toBe(true);
      expect(body.items.every((i) => i.status === 'pronto')).toBe(true);
    });

    it('1.6 item-fields', async () => {
      await seedFive();

      const res = await list().expect(200);

      expect(bodyOf<PageBody>(res).items[0]).toEqual(
        expect.objectContaining({
          status: expect.any(String) as string,
          publicationState: expect.any(String) as string,
          visibility: expect.any(String) as string,
          viewCount: expect.any(Number) as number,
          likeCount: expect.any(Number) as number,
          dislikeCount: expect.any(Number) as number,
          commentCount: expect.any(Number) as number,
        }),
      );
      expect(bodyOf<PageBody>(res).items[0]).toHaveProperty('publishedAt');
    });

    it('1.7 reject-invalid-params', async () => {
      for (const query of ['?pageSize=101', '?sort=invalido']) {
        const res = await list(query).expect(400);

        expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
      }
    });

    it('1.8 reject-unauthenticated', async () => {
      await list('', '').expect(401);
    });
  });
});
