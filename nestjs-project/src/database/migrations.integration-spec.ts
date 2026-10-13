import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Channel } from '../channels/entities/channel.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import { Category } from '../categories/entities/category.entity';
import { Video } from '../videos/entities/video.entity';
import { CreateUsersAndChannels1775687773260 } from './migrations/1775687773260-CreateUsersAndChannels';
import { CreateAuthTokens1777579850478 } from './migrations/1777579850478-CreateAuthTokens';
import { CreateVideos1791900000000 } from './migrations/1791900000000-CreateVideos';
import { CreateCategories1792000000000 } from './migrations/1792000000000-CreateCategories';
import { AddVideoManagementColumns1792100000000 } from './migrations/1792100000000-AddVideoManagementColumns';
import { createTestDataSource } from '../test/create-test-data-source';

const MANAGED_TABLES = [
  'users',
  'channels',
  'refresh_tokens',
  'verification_tokens',
  'videos',
  'categories',
];

describe('Database migrations (integration)', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = createTestDataSource(
      [User, Channel, RefreshToken, VerificationToken, Video, Category],
      {
        synchronize: false,
        migrations: [
          CreateUsersAndChannels1775687773260,
          CreateAuthTokens1777579850478,
          CreateVideos1791900000000,
          CreateCategories1792000000000,
          AddVideoManagementColumns1792100000000,
        ],
      },
    );

    await dataSource.initialize();

    for (const table of [...MANAGED_TABLES, 'migrations']) {
      await dataSource.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    await dataSource.query(
      `DROP TYPE IF EXISTS "public"."verification_tokens_type_enum"`,
    );
    await dataSource.query(`DROP TYPE IF EXISTS "public"."videos_status_enum"`);
    await dataSource.query(
      `DROP TYPE IF EXISTS "public"."videos_visibility_enum"`,
    );
  });

  afterAll(async () => {
    try {
      // The revert tests undo the last migrations, leaving tables missing.
      // Re-apply so the shared DB is fully migrated when subsequent suites run.
      await dataSource.runMigrations();
    } finally {
      await dataSource.destroy();
    }
  });

  it('should apply all migrations and create all six tables', async () => {
    const ranMigrations = await dataSource.runMigrations();

    expect(ranMigrations).toHaveLength(5);

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])
       ORDER BY table_name`,
      [MANAGED_TABLES],
    );
    const tableNames = result.map((r) => r.table_name);
    expect(tableNames).toEqual([
      'categories',
      'channels',
      'refresh_tokens',
      'users',
      'verification_tokens',
      'videos',
    ]);
  });

  it('should seed the eight categories in display order', async () => {
    const rows = await dataSource.query<{ slug: string; name: string }[]>(
      `SELECT slug, name FROM categories ORDER BY sort_order`,
    );

    expect(rows.map((r) => r.slug)).toEqual([
      'educacao',
      'entretenimento',
      'esportes',
      'jogos',
      'musica',
      'noticias',
      'tecnologia',
      'outros',
    ]);
    expect(rows.map((r) => r.name)).toEqual([
      'Educação',
      'Entretenimento',
      'Esportes',
      'Jogos',
      'Música',
      'Notícias',
      'Tecnologia',
      'Outros',
    ]);
  });

  it('should reject a duplicated category slug', async () => {
    await expect(
      dataSource.query(
        `INSERT INTO categories (slug, name, sort_order) VALUES ('educacao', 'Dup', 99)`,
      ),
    ).rejects.toThrow();
  });

  it('should backfill published_at for ready videos when the management migration runs', async () => {
    await dataSource.undoLastMigration();
    const [user] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO users (email, password) VALUES ('backfill@example.com', 'x') RETURNING id`,
    );
    const [channel] = await dataSource.query<{ id: string }[]>(
      `INSERT INTO channels (name, nickname, user_id) VALUES ('Backfill', 'backfill', $1) RETURNING id`,
      [user.id],
    );
    for (const [publicId, status] of [
      ['BackfillRdy', 'pronto'],
      ['BackfillDrf', 'rascunho'],
      ['BackfillPrc', 'processando'],
      ['BackfillErr', 'erro'],
    ]) {
      await dataSource.query(
        `INSERT INTO videos (public_id, channel_id, title, status, file_name, content_type, declared_size, storage_key)
         VALUES ($1, $2, 't', $3, 'f.mp4', 'video/mp4', 1, 'k')`,
        [publicId, channel.id, status],
      );
    }

    await dataSource.runMigrations();

    const rows = await dataSource.query<
      {
        public_id: string;
        published_at: Date | null;
        updated_at: Date;
        visibility: string;
      }[]
    >(
      `SELECT public_id, published_at, updated_at, visibility FROM videos ORDER BY public_id`,
    );
    const byId = Object.fromEntries(rows.map((r) => [r.public_id, r]));
    expect(byId['BackfillRdy'].published_at).toEqual(
      byId['BackfillRdy'].updated_at,
    );
    expect(byId['BackfillRdy'].visibility).toBe('public');
    expect(byId['BackfillDrf'].published_at).toBeNull();
    expect(byId['BackfillPrc'].published_at).toBeNull();
    expect(byId['BackfillErr'].published_at).toBeNull();

    await dataSource.query('DELETE FROM videos');
    await dataSource.query('DELETE FROM channels');
    await dataSource.query('DELETE FROM users');
  });

  it('should revert the management migration and drop its columns and enum type', async () => {
    await dataSource.undoLastMigration();

    const columns = await dataSource.query<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'videos'
         AND column_name = ANY($1::text[])`,
      [
        [
          'description',
          'category_id',
          'visibility',
          'published_at',
          'view_count',
        ],
      ],
    );
    expect(columns).toHaveLength(0);
    const types = await dataSource.query<{ typname: string }[]>(
      `SELECT typname FROM pg_type WHERE typname = 'videos_visibility_enum'`,
    );
    expect(types).toHaveLength(0);
  });

  it('should revert the categories migration and remove the table', async () => {
    await dataSource.undoLastMigration();

    const tables = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'categories'`,
    );
    expect(tables).toHaveLength(0);
  });

  it('should revert the videos migration and remove the table and enum type', async () => {
    await dataSource.undoLastMigration();

    const tables = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'videos'`,
    );
    expect(tables).toHaveLength(0);

    const types = await dataSource.query<{ typname: string }[]>(
      `SELECT typname FROM pg_type WHERE typname = 'videos_status_enum'`,
    );
    expect(types).toHaveLength(0);
  });

  it('should revert the auth tokens migration and remove token tables', async () => {
    await dataSource.undoLastMigration();

    const result = await dataSource.query<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name = ANY($1::text[])`,
      [['refresh_tokens', 'verification_tokens']],
    );
    expect(result).toHaveLength(0);
  });
});
