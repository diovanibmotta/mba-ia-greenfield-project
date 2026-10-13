import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Channel } from '../channels/entities/channel.entity';
import { createTestDataSource } from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { Video } from '../videos/entities/video.entity';
import { Category } from './entities/category.entity';
import { CategoriesModule } from './categories.module';
import { CategoriesService } from './categories.service';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('CategoriesService (integration)', () => {
  let moduleRef: TestingModule;
  let service: CategoriesService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(createTestDataSource(ALL_ENTITIES).options),
        CategoriesModule,
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  }, 60000);

  afterAll(async () => {
    await moduleRef.close();
  });

  it('should list the seeded categories in display order', async () => {
    const { items } = await service.findAll();

    expect(items.map((item) => item.slug)).toEqual([
      'educacao',
      'entretenimento',
      'esportes',
      'jogos',
      'musica',
      'noticias',
      'tecnologia',
      'outros',
    ]);
  });

  it('should expose only id, slug and name for each category', async () => {
    const { items } = await service.findAll();

    for (const item of items) {
      expect(Object.keys(item).sort()).toEqual(['id', 'name', 'slug']);
      expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    }
  });
});
