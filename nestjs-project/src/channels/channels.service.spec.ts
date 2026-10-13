import { BadRequestException } from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import {
  ChannelNotFoundException,
  NicknameAlreadyExistsException,
} from '../common/exceptions/domain.exception';
import { ChannelsService } from './channels.service';
import { Channel } from './entities/channel.entity';

type ManagerMock = {
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
};

function makeManager(overrides: Partial<ManagerMock> = {}): ManagerMock {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    ...overrides,
  };
}

function makeChannel(nickname: string): Channel {
  const c = new Channel();
  c.id = 'uuid';
  c.nickname = nickname;
  c.name = nickname;
  c.user_id = 'user-id';
  c.description = null;
  c.created_at = new Date();
  c.updated_at = new Date();
  return c;
}

function makeUniqueError(): QueryFailedError {
  const err = new QueryFailedError(
    'INSERT',
    [],
    new Error(),
  ) as QueryFailedError & {
    code: string;
    detail: string;
  };
  err.code = '23505';
  err.detail = 'Key (nickname)=(abc) already exists.';
  return err;
}

function makeDataSource(manager: ManagerMock): DataSource {
  return {
    transaction: jest.fn((cb: (m: ManagerMock) => Promise<unknown>) =>
      cb(manager),
    ),
  } as unknown as DataSource;
}

describe('ChannelsService', () => {
  describe('createChannel', () => {
    it('derives nickname from email prefix and saves when no collision', async () => {
      const channel = makeChannel('test');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(channel),
        save: jest.fn().mockResolvedValue(channel),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel('user-id', 'test@example.com');

      expect(manager.findOne).toHaveBeenCalledWith(Channel, {
        where: { nickname: 'test' },
      });
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(result.nickname).toBe('test');
    });

    it('retries with suffix when pre-check finds existing nickname', async () => {
      const colliding = makeChannel('john');
      const resolved = makeChannel('john_abc');
      const manager = makeManager({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(colliding)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue(resolved),
        save: jest.fn().mockResolvedValue(resolved),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel('user-id', 'john@example.com');

      expect(manager.findOne).toHaveBeenCalledTimes(2);
      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(result.nickname).toMatch(/^john_[a-z0-9]{3}$/);
    });

    it('retries with suffix on concurrent unique constraint violation', async () => {
      const resolved = makeChannel('alice_abc');
      const manager = makeManager({
        findOne: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(null),
        create: jest.fn().mockReturnValue(resolved),
        save: jest
          .fn()
          .mockRejectedValueOnce(makeUniqueError())
          .mockResolvedValueOnce(resolved),
      });
      const service = new ChannelsService(makeDataSource(manager));

      const result = await service.createChannel(
        'user-id',
        'alice@example.com',
      );

      expect(manager.save).toHaveBeenCalledTimes(2);
      expect(result.nickname).toMatch(/^alice/);
    });

    it('throws after exhausting max retries', async () => {
      const existing = makeChannel('bob');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn(),
      });
      const service = new ChannelsService(makeDataSource(manager));

      await expect(
        service.createChannel('user-id', 'bob@example.com'),
      ).rejects.toThrow(
        'Nickname conflict could not be resolved after max retries',
      );
    });

    it('re-throws non-unique-constraint errors immediately', async () => {
      const unexpectedError = new Error('Connection lost');
      const channel = makeChannel('carol');
      const manager = makeManager({
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(channel),
        save: jest.fn().mockRejectedValue(unexpectedError),
      });
      const service = new ChannelsService(makeDataSource(manager));

      await expect(
        service.createChannel('user-id', 'carol@example.com'),
      ).rejects.toThrow('Connection lost');
      expect(manager.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('findByUserId', () => {
    function makeRepoDataSource(repo: Record<string, jest.Mock>): DataSource {
      return {
        getRepository: jest.fn().mockReturnValue(repo),
      } as unknown as DataSource;
    }

    it('returns the channel of the user', async () => {
      const channel = makeChannel('mine');
      const service = new ChannelsService(
        makeRepoDataSource({ findOneBy: jest.fn().mockResolvedValue(channel) }),
      );

      await expect(service.findByUserId('user-id')).resolves.toBe(channel);
    });

    it('throws when the user has no channel', async () => {
      const service = new ChannelsService(
        makeRepoDataSource({ findOneBy: jest.fn().mockResolvedValue(null) }),
      );

      await expect(service.findByUserId('user-id')).rejects.toBeInstanceOf(
        ChannelNotFoundException,
      );
    });
  });

  describe('updateChannel', () => {
    function setup(update = jest.fn().mockResolvedValue(undefined)) {
      const channel = makeChannel('current');
      const repo = {
        findOneBy: jest.fn().mockResolvedValue(channel),
        findOneByOrFail: jest.fn().mockResolvedValue(channel),
        update,
      };
      const service = new ChannelsService({
        getRepository: jest.fn().mockReturnValue(repo),
      } as unknown as DataSource);
      return { service, repo, channel };
    }

    it('applies only the informed fields', async () => {
      const { service, repo } = setup();

      await service.updateChannel('user-id', { name: 'Novo' });

      expect(repo.update).toHaveBeenCalledWith(
        { id: 'uuid' },
        { name: 'Novo' },
      );
    });

    it('clears the description with null or empty string', async () => {
      for (const description of [null, '']) {
        const { service, repo } = setup();

        await service.updateChannel('user-id', { description });

        expect(repo.update).toHaveBeenCalledWith(
          { id: 'uuid' },
          { description: null },
        );
      }
    });

    it('does not write when the nickname is the current one', async () => {
      const { service, repo, channel } = setup();

      await expect(
        service.updateChannel('user-id', { nickname: 'current' }),
      ).resolves.toBe(channel);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('maps a nickname unique violation to NicknameAlreadyExists', async () => {
      const { service } = setup(jest.fn().mockRejectedValue(makeUniqueError()));

      await expect(
        service.updateChannel('user-id', { nickname: 'taken' }),
      ).rejects.toBeInstanceOf(NicknameAlreadyExistsException);
    });

    it('rethrows other database errors', async () => {
      const boom = new Error('boom');
      const { service } = setup(jest.fn().mockRejectedValue(boom));

      await expect(
        service.updateChannel('user-id', { name: 'x' }),
      ).rejects.toBe(boom);
    });

    it('rejects an empty body', async () => {
      const { service, repo } = setup();

      await expect(service.updateChannel('user-id', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });
});
