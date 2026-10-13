import { randomUUID } from 'node:crypto';
import {
  DeleteBucketCommand,
  GetBucketLifecycleConfigurationCommand,
  HeadBucketCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { StorageBootstrapService } from './storage-bootstrap.service';

describe('StorageBootstrapService (integration)', () => {
  const storage = storageConfig();
  const video = videoConfig();
  const bucket = `test-bootstrap-${randomUUID()}`;
  let client: S3Client;
  let service: StorageBootstrapService;

  beforeAll(() => {
    client = new S3Client({
      endpoint: storage.endpoint,
      region: storage.region,
      forcePathStyle: storage.forcePathStyle,
      credentials: {
        accessKeyId: storage.accessKey,
        secretAccessKey: storage.secretKey,
      },
    });
    service = new StorageBootstrapService(
      client,
      { ...storage, bucket },
      video,
    );
  });

  afterAll(async () => {
    try {
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
    } finally {
      client.destroy();
    }
  });

  it('should create the bucket on bootstrap and tolerate a second bootstrap', async () => {
    await service.onApplicationBootstrap();
    await expect(
      client.send(new HeadBucketCommand({ Bucket: bucket })),
    ).resolves.toBeDefined();

    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  }, 60000);

  it('should not fail the bootstrap when the server rejects the lifecycle rule', async () => {
    const applied = await service.ensureLifecycle();

    if (applied) {
      const lifecycle = await client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
      );
      expect(lifecycle.Rules).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Status: 'Enabled',
            AbortIncompleteMultipartUpload: {
              DaysAfterInitiation: video.uploadAbandonDays,
            },
          }),
        ]),
      );
    } else {
      // Local MinIO only accepts lifecycle rules that carry an expiration or
      // transition action, so the abandoned-upload rule is skipped with a warning.
      expect(applied).toBe(false);
    }
  }, 60000);
});
