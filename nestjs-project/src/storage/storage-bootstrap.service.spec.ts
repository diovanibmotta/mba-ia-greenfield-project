import {
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketLifecycleConfigurationCommand,
} from '@aws-sdk/client-s3';
import type { S3Client } from '@aws-sdk/client-s3';
import { StorageBootstrapService } from './storage-bootstrap.service';

const storage = {
  endpoint: 'http://minio:9000',
  publicEndpoint: 'http://minio:9000',
  region: 'us-east-1',
  bucket: 'bucket-under-test',
  accessKey: 'a',
  secretKey: 'b',
  forcePathStyle: true,
  presignExpiresSeconds: 900,
};
const video = {
  maxSizeBytes: 10737418240,
  partSizeBytes: 16777216,
  uploadAbandonDays: 3,
  thumbnailMaxBytes: 2097152,
  thumbnailMaxWidth: 1280,
  thumbnailMaxHeight: 720,
};

function buildService(send: jest.Mock) {
  return new StorageBootstrapService(
    { send } as unknown as S3Client,
    storage,
    video,
  );
}

describe('StorageBootstrapService', () => {
  it('should create the bucket when HeadBucket answers 404', async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce({ $metadata: { httpStatusCode: 404 } })
      .mockResolvedValue({});

    await buildService(send).ensureBucket();

    expect((send.mock.calls as unknown[][])[0][0]).toBeInstanceOf(
      HeadBucketCommand,
    );
    expect((send.mock.calls as unknown[][])[1][0]).toBeInstanceOf(
      CreateBucketCommand,
    );
  });

  it('should not create the bucket when it already exists', async () => {
    const send = jest.fn().mockResolvedValue({});

    await buildService(send).ensureBucket();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('should send the abort-incomplete-multipart rule with the configured days', async () => {
    const send = jest.fn().mockResolvedValue({});

    const applied = await buildService(send).ensureLifecycle();

    expect(applied).toBe(true);
    const command = (
      send.mock.calls as unknown[][]
    )[0][0] as PutBucketLifecycleConfigurationCommand;
    expect(command).toBeInstanceOf(PutBucketLifecycleConfigurationCommand);
    expect(command.input.LifecycleConfiguration?.Rules?.[0]).toMatchObject({
      Status: 'Enabled',
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 3 },
    });
  });

  it('should return false instead of throwing when the lifecycle rule is rejected', async () => {
    const send = jest.fn().mockRejectedValue(new Error('InvalidArgument'));

    await expect(buildService(send).ensureLifecycle()).resolves.toBe(false);
  });
});
