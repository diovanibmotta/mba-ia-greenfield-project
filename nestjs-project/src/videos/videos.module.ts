import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import videoConfig from '../config/video.config';
import { VideoQueueModule } from '../queue/video-queue.module';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { ChannelVideosController } from './channel-videos.controller';
import { MyVideosController } from './my-videos.controller';
import { ThumbnailImageService } from './thumbnail-image.service';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Video, Category]),
    ChannelsModule,
    StorageModule,
    VideoQueueModule,
    MulterModule.registerAsync({
      inject: [videoConfig.KEY],
      useFactory: (config: ConfigType<typeof videoConfig>) => ({
        limits: { fileSize: config.thumbnailMaxBytes, files: 1 },
      }),
    }),
  ],
  controllers: [VideosController, MyVideosController, ChannelVideosController],
  providers: [VideosService, ThumbnailImageService],
  exports: [VideosService],
})
export class VideosModule {}
