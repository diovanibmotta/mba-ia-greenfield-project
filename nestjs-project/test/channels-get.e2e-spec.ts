import request from 'supertest';
import { VideoStatus } from '../src/videos/video-status.enum';
import { VideoVisibility } from '../src/videos/video-visibility.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type ChannelBody = {
  nickname: string;
  name: string;
  description: string | null;
  createdAt: string;
  videoCount: number;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('channels-get (e2e)', () => {
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
  });

  describe('1. Página pública do canal', () => {
    it('1.1 get-public-channel', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get(`/channels/${nickname}`)
        .expect(200);

      expect(bodyOf<ChannelBody>(res)).toMatchObject({
        nickname,
        name: expect.any(String) as string,
        description: null,
        createdAt: expect.any(String) as string,
        videoCount: 0,
      });
    });

    it('1.2 video-count-only-published-public', async () => {
      await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: new Date(),
      });
      await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: new Date(),
        visibility: VideoVisibility.UNLISTED,
      });
      await insertVideo(ctx, channelId, {
        status: VideoStatus.READY,
        published_at: null,
      });
      await insertVideo(ctx, channelId, { status: VideoStatus.PROCESSING });

      const res = await request(ctx.app.getHttpServer())
        .get(`/channels/${nickname}`)
        .expect(200);

      expect(bodyOf<ChannelBody>(res).videoCount).toBe(1);
    });

    it('1.3 unknown-channel', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/channels/inexistente')
        .expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('CHANNEL_NOT_FOUND');
    });
  });
});
