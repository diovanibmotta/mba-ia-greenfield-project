import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './entities/channel.entity';
import { Video } from '../videos/entities/video.entity';
import { ChannelsService } from './channels.service';
import { ChannelsController } from './channels.controller';
import { MyChannelController } from './my-channel.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Channel, Video])],
  controllers: [MyChannelController, ChannelsController],
  providers: [ChannelsService],
  exports: [TypeOrmModule, ChannelsService],
})
export class ChannelsModule {}
