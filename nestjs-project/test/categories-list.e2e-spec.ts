import request from 'supertest';
import { bootstrapVideoE2e, VideoE2eContext } from './support/video-e2e';

type CategoriesBody = {
  items: { id: string; slug: string; name: string }[];
};

describe('categories-list (e2e)', () => {
  let ctx: VideoE2eContext;

  beforeAll(async () => {
    ctx = await bootstrapVideoE2e();
  }, 60000);

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await ctx.reset();
  });

  describe('1. Listagem de categorias', () => {
    it('1.1 list-categories-anonymous', async () => {
      const res = await request(ctx.app.getHttpServer())
        .get('/categories')
        .expect(200);

      const { items } = res.body as CategoriesBody;
      expect(items).toHaveLength(8);
      expect(items.map((item) => item.name)).toEqual([
        'Educação',
        'Entretenimento',
        'Esportes',
        'Jogos',
        'Música',
        'Notícias',
        'Tecnologia',
        'Outros',
      ]);
      for (const item of items) {
        expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(typeof item.slug).toBe('string');
        expect(typeof item.name).toBe('string');
      }
    });
  });
});
