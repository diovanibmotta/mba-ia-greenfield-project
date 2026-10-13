import request from 'supertest';
import { Video } from '../src/videos/entities/video.entity';
import { VideoStatus } from '../src/videos/video-status.enum';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type ErrorBody = { error: string };
type DraftBody = { id: string };

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-cancel-upload (e2e)', () => {
  let ctx: VideoE2eContext;
  let ownerToken: string;
  let otherToken: string;
  let publicId: string;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
    ownerToken = (await ctx.createOwner()).token;
    otherToken = (await ctx.createOwner()).token;
    const res = await request(ctx.app.getHttpServer())
      .post('/videos')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fileName: 'aula.mp4',
        fileSize: 1073741824,
        contentType: 'video/mp4',
      })
      .expect(201);
    publicId = bodyOf<DraftBody>(res).id;
  });

  const cancel = (token?: string) => {
    const req = request(ctx.app.getHttpServer()).delete(
      `/videos/${publicId}/upload`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  describe('1. Cancelamento do upload', () => {
    it('1.1 cancel-draft-upload', async () => {
      const row = await ctx.dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: publicId });

      await cancel(ownerToken).expect(204);

      expect(
        await ctx.dataSource.getRepository(Video).countBy({ id: row.id }),
      ).toBe(0);
      await expect(
        ctx.storage.listParts(row.storage_key, row.upload_id!),
      ).rejects.toMatchObject({ name: 'NoSuchUpload' });
    });

    it('1.2 hide-video-from-non-owner', async () => {
      const res = await cancel(otherToken).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.3 reject-processing-state', async () => {
      await ctx.dataSource
        .getRepository(Video)
        .update({ public_id: publicId }, { status: VideoStatus.PROCESSING });

      const res = await cancel(ownerToken).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('INVALID_UPLOAD_STATE');
    });

    it('1.4 reject-unauthenticated', async () => {
      await cancel().expect(401);
    });
  });
});
