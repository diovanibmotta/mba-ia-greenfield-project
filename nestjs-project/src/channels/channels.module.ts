import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './entities/channel.entity';
import { ChannelsService } from './channels.service';
import { MyChannelController } from './my-channel.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Channel])],
  controllers: [MyChannelController],
  providers: [ChannelsService],
  exports: [TypeOrmModule, ChannelsService],
})
export class ChannelsModule {}
