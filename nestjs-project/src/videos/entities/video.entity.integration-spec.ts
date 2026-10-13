import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../../auth/entities/refresh-token.entity';
import { VerificationToken } from '../../auth/entities/verification-token.entity';
import { Channel } from '../../channels/entities/channel.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../../test/create-test-data-source';
import { User } from '../../users/entities/user.entity';
import { generatePublicId } from '../public-id.util';
import { VideoStatus } from '../video-status.enum';
import { Video } from './video.entity';

const ALL_ENTITIES = [User, Channel, RefreshToken, VerificationToken, Video];

describe('Video entity (integration)', () => {
  let dataSource: DataSource;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;
  let videoRepository: Repository<Video>;
  let channel: Channel;
  let counter = 0;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    videoRepository = dataSource.getRepository(Video);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    counter += 1;
    const user = await userRepository.save(
      userRepository.create({
        email: `video_owner_${counter}@example.com`,
        password: 'hashed',
      }),
    );
    channel = await channelRepository.save(
      channelRepository.create({
        name: 'Owner',
        nickname: `owner_${counter}`,
        user_id: user.id,
      }),
    );
  });

  function buildVideo(overrides: Partial<Video> = {}): Video {
    return videoRepository.create({
      public_id: generatePublicId(),
      channel_id: channel.id,
      title: 'Aula',
      file_name: 'aula.mp4',
      content_type: 'video/mp4',
      declared_size: 1073741824,
      storage_key: 'videos/some-id/original.mp4',
      ...overrides,
    });
  }

  it('should default status to rascunho and processing_attempts to 0', async () => {
    const saved = await videoRepository.save(buildVideo());

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.status).toBe(VideoStatus.DRAFT);
    expect(found.processing_attempts).toBe(0);
    expect(found.size_bytes).toBeNull();
    expect(found.upload_id).toBeNull();
  });

  it('should enforce unique public_id', async () => {
    await videoRepository.save(buildVideo({ public_id: 'AAAAAAAAAAA' }));

    await expect(
      videoRepository.save(buildVideo({ public_id: 'AAAAAAAAAAA' })),
    ).rejects.toThrow();
  });

  it('should reject a status outside the enum', async () => {
    await expect(
      videoRepository.save(
        buildVideo({ status: 'publicado' as unknown as VideoStatus }),
      ),
    ).rejects.toThrow();
  });

  it('should enforce the channel foreign key', async () => {
    await expect(
      videoRepository.save(
        buildVideo({ channel_id: '00000000-0000-4000-8000-000000000000' }),
      ),
    ).rejects.toThrow();
  });

  it('should return bigint and numeric columns as numbers', async () => {
    const saved = await videoRepository.save(
      buildVideo({
        declared_size: 10737418240,
        size_bytes: 10737418240,
        duration_seconds: 125.5,
      }),
    );

    const found = await videoRepository.findOneByOrFail({ id: saved.id });
    expect(found.declared_size).toBe(10737418240);
    expect(found.size_bytes).toBe(10737418240);
    expect(found.duration_seconds).toBe(125.5);
  });
});
