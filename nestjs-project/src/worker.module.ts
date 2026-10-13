import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from './channels/entities/channel.entity';
import appConfig from './config/app.config';
import databaseConfig from './config/database.config';
import { envValidationSchema } from './config/env.validation';
import queueConfig from './config/queue.config';
import storageConfig from './config/storage.config';
import videoConfig from './config/video.config';
import { typeOrmRoot } from './database/typeorm-root';
import { VideoQueueModule } from './queue/video-queue.module';
import { StorageModule } from './storage/storage.module';
import { User } from './users/entities/user.entity';
import { Video } from './videos/entities/video.entity';
import { Category } from './categories/entities/category.entity';
import { ThumbnailService } from './worker/thumbnail.service';
import { VideoProbeService } from './worker/video-probe.service';
import { VideoProcessingProcessor } from './worker/video-processing.processor';

// Background worker: same codebase as the API, no HTTP listener (see worker.ts).
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        queueConfig,
        storageConfig,
        videoConfig,
      ],
      validationSchema: envValidationSchema,
      validationOptions: { allowUnknown: true, abortEarly: false },
    }),
    typeOrmRoot,
    // Video references Channel, which references User: all three must be registered.
    TypeOrmModule.forFeature([Video, Category, Channel, User]),
    StorageModule,
    VideoQueueModule,
  ],
  providers: [VideoProbeService, ThumbnailService, VideoProcessingProcessor],
})
export class WorkerModule {}
