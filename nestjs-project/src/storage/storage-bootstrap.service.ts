import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { S3_CLIENT } from './storage.constants';

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 2000;

@Injectable()
export class StorageBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageBootstrapService.name);

  constructor(
    @Inject(S3_CLIENT) private readonly s3: S3Client,
    @Inject(storageConfig.KEY)
    private readonly storage: ConfigType<typeof storageConfig>,
    @Inject(videoConfig.KEY)
    private readonly video: ConfigType<typeof videoConfig>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureBucket();
    await this.ensureLifecycle();
  }

  async ensureBucket(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await this.createBucketIfMissing();
        return;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS) throw error;
        this.logger.warn(
          `Object storage not ready (attempt ${attempt}/${MAX_ATTEMPTS}): ${String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  /** Returns false when the server rejects the rule (e.g. local MinIO). */
  async ensureLifecycle(): Promise<boolean> {
    try {
      await this.s3.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.storage.bucket,
          LifecycleConfiguration: {
            Rules: [
              {
                ID: 'abort-incomplete-multipart-uploads',
                Status: 'Enabled',
                Filter: { Prefix: '' },
                AbortIncompleteMultipartUpload: {
                  DaysAfterInitiation: this.video.uploadAbandonDays,
                },
              },
            ],
          },
        }),
      );
      return true;
    } catch (error) {
      // Some S3-compatible servers (local MinIO builds) reject this rule.
      this.logger.warn(
        `Could not apply the abandoned multipart upload lifecycle rule: ${String(error)}`,
      );
      return false;
    }
  }

  private async createBucketIfMissing(): Promise<void> {
    try {
      await this.s3.send(
        new HeadBucketCommand({ Bucket: this.storage.bucket }),
      );
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status !== 404) throw error;
      await this.s3.send(
        new CreateBucketCommand({ Bucket: this.storage.bucket }),
      );
    }
  }
}
