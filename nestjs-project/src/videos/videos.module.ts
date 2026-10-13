import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';
import { VideoQueueModule } from '../queue/video-queue.module';
import { StorageModule } from '../storage/storage.module';
import { Video } from './entities/video.entity';
import { Category } from '../categories/entities/category.entity';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Video, Category]),
    ChannelsModule,
    StorageModule,
    VideoQueueModule,
  ],
  controllers: [VideosController],
  providers: [VideosService],
  exports: [VideosService],
})
export class VideosModule {}
