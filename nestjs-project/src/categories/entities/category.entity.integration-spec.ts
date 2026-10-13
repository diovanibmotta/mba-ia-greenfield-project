import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import { createTestDataSource } from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { Video } from '../../videos/entities/video.entity';
import { Category } from './category.entity';

describe('Category entity (integration)', () => {
  let dataSource: DataSource;
  let repository: Repository<Category>;

  beforeAll(async () => {
    dataSource = createTestDataSource([
      User,
      Channel,
      RefreshToken,
      VerificationToken,
      Video,
      Category,
    ]);
    await dataSource.initialize();
    repository = dataSource.getRepository(Category);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await repository.delete({ slug: 'test-category' });
  });

  afterEach(async () => {
    await repository.delete({ slug: 'test-category' });
  });

  it('should persist a category with a generated id and timestamp', async () => {
    const saved = await repository.save(
      repository.create({
        slug: 'test-category',
        name: 'Test',
        sort_order: 99,
      }),
    );

    expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(saved.created_at).toBeInstanceOf(Date);
  });

  it('should enforce a unique slug', async () => {
    await repository.save(
      repository.create({
        slug: 'test-category',
        name: 'Test',
        sort_order: 99,
      }),
    );

    await expect(
      repository.save(
        repository.create({
          slug: 'test-category',
          name: 'Other',
          sort_order: 98,
        }),
      ),
    ).rejects.toThrow();
  });
});
