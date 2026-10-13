import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { VerificationToken } from '../auth/entities/verification-token.entity';
import {
  cleanAllTables,
  createTestDataSource,
} from '../test/create-test-data-source';
import { User } from '../users/entities/user.entity';
import { NicknameAlreadyExistsException } from '../common/exceptions/domain.exception';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/video-status.enum';
import { VideoVisibility } from '../videos/video-visibility.enum';
import { Category } from '../categories/entities/category.entity';

const ALL_ENTITIES = [
  User,
  Channel,
  RefreshToken,
  VerificationToken,
  Video,
  Category,
];

describe('ChannelsService (integration)', () => {
  let dataSource: DataSource;
  let channelsService: ChannelsService;
  let userRepository: Repository<User>;
  let channelRepository: Repository<Channel>;

  beforeAll(async () => {
    dataSource = createTestDataSource(ALL_ENTITIES);
    await dataSource.initialize();
    userRepository = dataSource.getRepository(User);
    channelRepository = dataSource.getRepository(Channel);
    channelsService = new ChannelsService(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
  });

  let userCounter = 0;
  async function createUser(): Promise<User> {
    return userRepository.save(
      userRepository.create({
        email: `ch_svc_${++userCounter}@example.com`,
        password: 'hashed',
      }),
    );
  }

  describe('createChannel', () => {
    it('persists a channel derived from email', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'mynick@example.com',
      );

      expect(channel.id).toBeDefined();
      expect(channel.nickname).toBe('mynick');
      expect(channel.name).toBe('mynick');
      expect(channel.user_id).toBe(user.id);

      const persisted = await channelRepository.findOneBy({ user_id: user.id });
      expect(persisted).not.toBeNull();
      expect(persisted!.nickname).toBe('mynick');
    });

    it('derives nickname from email prefix', async () => {
      const user = await createUser();

      const channel = await channelsService.createChannel(
        user.id,
        'John.Doe+tag@example.com',
      );

      expect(channel.nickname).toBe('johndoetag');
    });

    it('resolves nickname collision by appending a suffix', async () => {
      const user1 = await createUser();
      const user2 = await createUser();

      await channelsService.createChannel(user1.id, 'shared@example.com');
      const channel2 = await channelsService.createChannel(
        user2.id,
        'shared@example.com',
      );

      expect(channel2.nickname).toMatch(/^shared_[a-z0-9]{3}$/);

      const channels = await channelRepository.find();
      expect(channels).toHaveLength(2);
    });
  });

  describe('findByUserId / updateChannel', () => {
    it('reads the channel of the user', async () => {
      const user = await createUser();
      const created = await channelsService.createChannel(
        user.id,
        'reader@example.com',
      );

      const found = await channelsService.findByUserId(user.id);

      expect(found.id).toBe(created.id);
    });

    it('enforces nickname uniqueness and releases the old nickname', async () => {
      const first = await createUser();
      const second = await createUser();
      await channelsService.createChannel(first.id, 'one@example.com');
      await channelsService.createChannel(second.id, 'two@example.com');

      await expect(
        channelsService.updateChannel(second.id, { nickname: 'one' }),
      ).rejects.toBeInstanceOf(NicknameAlreadyExistsException);

      await channelsService.updateChannel(first.id, { nickname: 'renamed' });
      const taken = await channelsService.updateChannel(second.id, {
        nickname: 'one',
      });
      expect(taken.nickname).toBe('one');
    });

    it('keeps the current nickname without conflict and clears the description', async () => {
      const user = await createUser();
      await channelsService.createChannel(user.id, 'same@example.com');
      await channelsService.updateChannel(user.id, { description: 'texto' });

      const updated = await channelsService.updateChannel(user.id, {
        nickname: 'same',
        description: '',
      });

      expect(updated).toMatchObject({ nickname: 'same', description: null });
    });
  });

  describe('getPublicChannel', () => {
    it('counts only ready, published and public videos', async () => {
      const user = await createUser();
      const channel = await channelsService.createChannel(
        user.id,
        'counter@example.com',
      );
      const repository = dataSource.getRepository(Video);
      const base = {
        channel_id: channel.id,
        title: 'v',
        file_name: 'a.mp4',
        content_type: 'video/mp4',
        declared_size: 1000,
      };
      const rows: Partial<Video>[] = [
        { status: VideoStatus.READY, published_at: new Date() },
        { status: VideoStatus.READY, published_at: new Date() },
        {
          status: VideoStatus.READY,
          published_at: new Date(),
          visibility: VideoVisibility.UNLISTED,
        },
        { status: VideoStatus.READY, published_at: null },
        { status: VideoStatus.PROCESSING, published_at: null },
      ];
      for (const [i, row] of rows.entries()) {
        await repository.save(
          repository.create({
            ...base,
            ...row,
            public_id: `COUNT${String(i).padStart(6, '0')}`,
            storage_key: `videos/count-${i}/original.mp4`,
          }),
        );
      }

      const result = await channelsService.getPublicChannel('counter');

      expect(result.videoCount).toBe(2);
    });
  });
});
