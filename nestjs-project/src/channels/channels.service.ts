import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource, Not, IsNull } from 'typeorm';
import { isPgUniqueViolationOnColumn } from '../common/database/pg-errors.util';
import {
  ChannelNotFoundException,
  NicknameAlreadyExistsException,
} from '../common/exceptions/domain.exception';
import { PublicChannelResponseDto } from './dto/public-channel-response.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { Video } from '../videos/entities/video.entity';
import { VideoStatus } from '../videos/video-status.enum';
import { VideoVisibility } from '../videos/video-visibility.enum';
import { appendRandomSuffix, sanitizeNickname } from './nickname.util';
import { Channel } from './entities/channel.entity';

const NICKNAME_COLUMN = 'nickname';
const MAX_RETRIES = 5;

@Injectable()
export class ChannelsService {
  constructor(private readonly dataSource: DataSource) {}

  async createChannel(userId: string, email: string): Promise<Channel> {
    const baseNickname = sanitizeNickname(email.split('@')[0]);

    return this.dataSource.transaction(async (manager) => {
      let nickname = baseNickname;

      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        const existing = await manager.findOne(Channel, {
          where: { nickname },
        });
        if (existing) {
          nickname = appendRandomSuffix(baseNickname);
          continue;
        }

        try {
          return await manager.save(
            manager.create(Channel, {
              name: baseNickname,
              nickname,
              user_id: userId,
            }),
          );
        } catch (err) {
          if (isPgUniqueViolationOnColumn(err, NICKNAME_COLUMN)) {
            // Concurrent insert between pre-check and save — retry with new suffix
            nickname = appendRandomSuffix(baseNickname);
          } else {
            throw err;
          }
        }
      }

      throw new Error(
        'Nickname conflict could not be resolved after max retries',
      );
    });
  }

  async findByUserId(userId: string): Promise<Channel> {
    const channel = await this.dataSource
      .getRepository(Channel)
      .findOneBy({ user_id: userId });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  async updateChannel(userId: string, dto: UpdateChannelDto): Promise<Channel> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('At least one field must be informed');
    }
    const channel = await this.findByUserId(userId);

    const changes: Pick<
      Partial<Channel>,
      'nickname' | 'name' | 'description'
    > = {};
    if (dto.nickname !== undefined && dto.nickname !== channel.nickname) {
      changes.nickname = dto.nickname;
    }
    if (dto.name !== undefined) changes.name = dto.name;
    if (dto.description !== undefined) {
      changes.description = dto.description === '' ? null : dto.description;
    }
    if (Object.keys(changes).length === 0) return channel;

    try {
      await this.dataSource
        .getRepository(Channel)
        .update({ id: channel.id }, changes);
    } catch (error) {
      if (isPgUniqueViolationOnColumn(error, NICKNAME_COLUMN)) {
        throw new NicknameAlreadyExistsException();
      }
      throw error;
    }
    return this.dataSource
      .getRepository(Channel)
      .findOneByOrFail({ id: channel.id });
  }

  async findByNickname(nickname: string): Promise<Channel> {
    const channel = await this.dataSource
      .getRepository(Channel)
      .findOneBy({ nickname });
    if (!channel) throw new ChannelNotFoundException();
    return channel;
  }

  async getPublicChannel(nickname: string): Promise<PublicChannelResponseDto> {
    const channel = await this.findByNickname(nickname);
    const videoCount = await this.dataSource.getRepository(Video).countBy({
      channel_id: channel.id,
      status: VideoStatus.READY,
      published_at: Not(IsNull()),
      visibility: VideoVisibility.PUBLIC,
    });
    return {
      nickname: channel.nickname,
      name: channel.name,
      description: channel.description,
      createdAt: channel.created_at.toISOString(),
      videoCount,
    };
  }
}
