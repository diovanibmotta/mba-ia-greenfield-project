import request from 'supertest';
import sharp from 'sharp';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import {
  bootstrapVideoE2e,
  insertVideo,
  VideoE2eContext,
} from './support/video-e2e';

type ErrorBody = { error: string };
type ThumbnailBody = { thumbnailUrl: string };
type VideoBody = { thumbnailUrl: string | null };

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-thumbnail (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
  let ownerToken: string;
  let otherToken: string;
  let publicId: string;
  let png: Buffer;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
    png = await sharp({
      create: { width: 2000, height: 1500, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
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
    publicId = (
      await insertVideo(ctx, channelId, { status: VideoStatus.READY })
    ).public_id;
  });

  const put = (
    file: { content: Buffer; name: string } | null,
    token?: string,
    id = publicId,
  ) => {
    const req = request(ctx.app.getHttpServer()).put(`/videos/${id}/thumbnail`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (file) req.attach('file', file.content, file.name);
    else req.field('other', 'x');
    return req;
  };

  describe('1. Thumbnail customizada', () => {
    it('1.1 replace-thumbnail-with-png', async () => {
      const res = await put(
        { content: png, name: 'capa.png' },
        ownerToken,
      ).expect(200);

      const { thumbnailUrl } = bodyOf<ThumbnailBody>(res);
      const image = await fetch(thumbnailUrl);
      expect(image.headers.get('content-type')).toBe('image/jpeg');
      const meta = await sharp(
        Buffer.from(await image.arrayBuffer()),
      ).metadata();
      expect(meta.width).toBeLessThanOrEqual(1280);
      expect(meta.height).toBeLessThanOrEqual(720);
      const row = await ctx.dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: publicId });
      expect(row.thumbnail_key).toBe(`videos/${row.id}/thumbnail-custom.jpg`);
      const get = await request(ctx.app.getHttpServer())
        .get(`/videos/${publicId}`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);
      expect(bodyOf<VideoBody>(get).thumbnailUrl).toEqual(expect.any(String));
    });

    it('1.2 reject-non-image', async () => {
      const res = await put(
        { content: Buffer.from('texto'), name: 'capa.txt' },
        ownerToken,
      ).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_THUMBNAIL');
    });

    it('1.3 reject-missing-file', async () => {
      const res = await put(null, ownerToken).expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_THUMBNAIL');
    });

    it('1.4 reject-too-large', async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1024, 1);

      const res = await put(
        { content: big, name: 'big.png' },
        ownerToken,
      ).expect(413);

      expect(bodyOf<ErrorBody>(res).error).toBe('THUMBNAIL_TOO_LARGE');
    });

    it('1.5 hide-video-from-non-owner', async () => {
      const res = await put(
        { content: png, name: 'capa.png' },
        otherToken,
      ).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.6 reject-upload-in-progress', async () => {
      const draft = await insertVideo(ctx, channelId, {
        status: VideoStatus.DRAFT,
        upload_id: 'upload-1',
      });

      const res = await put(
        { content: png, name: 'capa.png' },
        ownerToken,
        draft.public_id,
      ).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_UPLOAD_IN_PROGRESS');
    });

    it('1.7 reject-unauthenticated', async () => {
      await put({ content: png, name: 'capa.png' }).expect(401);
    });
  });
});
