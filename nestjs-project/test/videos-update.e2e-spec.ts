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
  title: string;
  description: string | null;
  visibility: string;
  category: { id: string; slug: string; name: string } | null;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-update (e2e)', () => {
  let ctx: VideoE2eContext;
  let channelId: string;
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
    const owner = await ctx.createOwner();
    channelId = owner.channel.id;
    ownerToken = owner.token;
    otherToken = (await ctx.createOwner()).token;
    const video = await insertVideo(ctx, channelId, {
      status: VideoStatus.READY,
      description: 'Descrição inicial',
    });
    publicId = video.public_id;
  });

  const patch = (body: unknown, token?: string, id = publicId) => {
    const req = request(ctx.app.getHttpServer()).patch(`/videos/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body as object);
  };

  describe('1. Edição do vídeo', () => {
    it('1.1 update-title', async () => {
      const res = await patch({ title: 'Novo título' }, ownerToken).expect(200);

      expect(bodyOf<VideoBody>(res).title).toBe('Novo título');
    });

    it('1.2 clear-description', async () => {
      const res = await patch({ description: null }, ownerToken).expect(200);

      expect(bodyOf<VideoBody>(res).description).toBeNull();
    });

    it('1.3 set-category', async () => {
      const category = await ctx.dataSource
        .getRepository(Category)
        .findOneByOrFail({ slug: 'educacao' });

      const res = await patch({ categoryId: category.id }, ownerToken).expect(
        200,
      );

      expect(bodyOf<VideoBody>(res).category).toEqual({
        id: category.id,
        slug: 'educacao',
        name: 'Educação',
      });
    });

    it('1.4 reject-unknown-category', async () => {
      const res = await patch(
        { categoryId: '00000000-0000-4000-8000-000000000000' },
        ownerToken,
      ).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('CATEGORY_NOT_FOUND');
    });

    it('1.5 set-visibility', async () => {
      const res = await patch({ visibility: 'unlisted' }, ownerToken).expect(
        200,
      );

      expect(bodyOf<VideoBody>(res).visibility).toBe('unlisted');
    });

    it('1.6 reject-upload-in-progress', async () => {
      const draft = await insertVideo(ctx, channelId, {
        status: VideoStatus.DRAFT,
        upload_id: 'upload-1',
      });

      const res = await patch(
        { title: 'x' },
        ownerToken,
        draft.public_id,
      ).expect(409);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_UPLOAD_IN_PROGRESS');
    });

    it('1.7 hide-video-from-non-owner', async () => {
      const res = await patch({ title: 'x' }, otherToken).expect(404);

      expect(bodyOf<ErrorBody>(res).error).toBe('VIDEO_NOT_FOUND');
    });

    it('1.8 reject-empty-body-or-title', async () => {
      for (const body of [{}, { title: '' }]) {
        const res = await patch(body, ownerToken).expect(400);

        expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
      }
    });

    it('1.9 reject-unauthenticated', async () => {
      await patch({ title: 'x' }).expect(401);
    });
  });
});
