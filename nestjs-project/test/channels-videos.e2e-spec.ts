import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import { VideoVisibility } from '../src/videos/video-visibility.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type Item = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  publishedAt: string;
  viewCount: number;
};
type PageBody = { items: Item[]; nextCursor: string | null };

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('channels-videos (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let nickname: string;

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
    nickname = owner.channel.nickname;
    for (let i = 0; i < 5; i++) {
      await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        title: `Video ${i}`,
        published_at: new Date(2026, 9, 1 + i),
      });
    }
    await insertVideo(ctx, channelId, {
      status: VideoStatus.READY,
      visibility: VideoVisibility.UNLISTED,
      published_at: new Date(2026, 9, 20),
    });
    await insertVideo(ctx, channelId, {
      status: VideoStatus.READY,
      published_at: null,
    });
  });

  const list = (query = '', name = nickname) =>
    request(ctx.app.getHttpServer()).get(`/channels/${name}/videos${query}`);

  describe('1. Listagem pública', () => {
    it('1.1 list-published-public-only', async () => {
      const res = await list().expect(200);

      const body = bodyOf<PageBody>(res);
      expect(body.items).toHaveLength(5);
      expect(body.items.map((i) => i.title)).toEqual([
        'Video 4',
        'Video 3',
        'Video 2',
        'Video 1',
        'Video 0',
      ]);
      expect(body.items[0]).toEqual({
        id: expect.any(String) as string,
        title: 'Video 4',
        thumbnailUrl: null,
        durationSeconds: null,
        publishedAt: expect.any(String) as string,
        viewCount: expect.any(Number) as number,
      });
      expect(body.nextCursor).toBeNull();
    });

    it('1.2 paginate-with-cursor', async () => {
      const seen: string[] = [];
      const first = bodyOf<PageBody>(await list('?limit=2').expect(200));
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).toEqual(expect.any(String));
      seen.push(...first.items.map((i) => i.id));

      let cursor = first.nextCursor;
      let last = first;
      while (cursor) {
        last = bodyOf<PageBody>(
          await list(`?limit=2&cursor=${cursor}`).expect(200),
        );
        seen.push(...last.items.map((i) => i.id));
        cursor = last.nextCursor;
      }

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect(last.nextCursor).toBeNull();
    });

    it('1.3 reject-invalid-cursor', async () => {
      const res = await list('?cursor=invalido').expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_CURSOR');
    });

    it('1.4 reject-invalid-limit', async () => {
      const res = await list('?limit=51').expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.5 unknown-channel', async () => {
      const res = await list('', 'inexistente').expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('CHANNEL_NOT_FOUND');
    });
  });
});
