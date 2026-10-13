import request from 'supertest';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type ChannelBody = {
  id: string;
  nickname: string;
  name: string;
  description: string | null;
  createdAt: string;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('me-channel-get (e2e)', () => {
  let ctx: VideoE2eContext;
  let token: string;
  let channelId: string;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    const owner = await ctx.createOwner();
    token = owner.token;
    channelId = owner.channel.id;
  });

  describe('1. Consulta do próprio canal', () => {
    it('1.1 get-my-channel', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/me/channel')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(bodyOf<ChannelBody>(res)).toMatchObject({
        id: channelId,
        nickname: expect.any(String) as string,
        name: expect.any(String) as string,
        createdAt: expect.any(String) as string,
      });
    });

    it('1.2 channel-without-description', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/me/channel')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(bodyOf<ChannelBody>(res).description).toBeNull();
    });

    it('1.3 reject-unauthenticated', async () => {
      await request(ctx.app.getHttpServer()).get('/me/channel').expect(401);
    });
  });
});
