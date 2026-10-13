import request from 'supertest';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type ErrorBody = { error: string };
type ChannelBody = {
  nickname: string;
  name: string;
  description: string | null;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('me-channel-update (e2e)', () => {
  let ctx: VideoE2eContext;
  let firstToken: string;
  let secondToken: string;
  let firstNickname: string;
  let secondNickname: string;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    const first = await ctx.createOwner();
    const second = await ctx.createOwner();
    firstToken = first.token;
    secondToken = second.token;
    firstNickname = first.channel.nickname;
    secondNickname = second.channel.nickname;
  });

  const patch = (body: unknown, token?: string) => {
    const req = request(ctx.app.getHttpServer()).patch('/me/channel');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body as object);
  };

  describe('1. Edição do canal', () => {
    it('1.1 update-name', async () => {
      const res = await patch({ name: 'Meu canal' }, firstToken).expect(200);

      expect(bodyOf<ChannelBody>(res).name).toBe('Meu canal');
    });

    it('1.2 update-nickname', async () => {
      const res = await patch({ nickname: 'novo_nick' }, firstToken).expect(
        200,
      );

      expect(bodyOf<ChannelBody>(res).nickname).toBe('novo_nick');
    });

    it('1.3 old-nickname-is-released', async () => {
      await patch({ nickname: 'liberado' }, firstToken).expect(200);

      await patch({ nickname: firstNickname }, secondToken).expect(200);
    });

    it('1.4 reject-taken-nickname', async () => {
      const res = await patch({ nickname: secondNickname }, firstToken).expect(
        409,
      );

      expect(bodyOf<ErrorBody>(res).error).toBe('NICKNAME_ALREADY_EXISTS');
    });

    it('1.5 same-nickname-is-ok', async () => {
      await patch({ nickname: firstNickname }, firstToken).expect(200);
    });

    it('1.6 clear-description', async () => {
      await patch({ description: 'algo' }, firstToken).expect(200);

      const res = await patch({ description: '' }, firstToken).expect(200);

      expect(bodyOf<ChannelBody>(res).description).toBeNull();
    });

    it('1.7 reject-invalid-nickname', async () => {
      const res = await patch({ nickname: 'Nick Name' }, firstToken).expect(
        400,
      );

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.8 reject-empty-body', async () => {
      const res = await patch({}, firstToken).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.9 reject-unauthenticated', async () => {
      await patch({ name: 'x' }).expect(401);
    });
  });
});
