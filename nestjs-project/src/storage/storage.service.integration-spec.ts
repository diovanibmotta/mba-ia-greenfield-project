import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { StorageBootstrapService } from './storage-bootstrap.service';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';

const MIN_PART_SIZE = 5 * 1024 * 1024;

describe('StorageService (integration)', () => {
  let moduleRef: TestingModule;
  let storage: StorageService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, videoConfig],
        }),
        StorageModule,
      ],
    }).compile();
    await moduleRef.get(StorageBootstrapService).ensureBucket();
    storage = moduleRef.get(StorageService);
  }, 60000);

  afterAll(async () => {
    await moduleRef.close();
  });

  async function putPart(
    key: string,
    uploadId: string,
    partNumber: number,
    body: BlobPart,
  ): Promise<string> {
    const url = await storage.presignUploadPart(key, uploadId, partNumber);
    const response = await fetch(url, {
      method: 'PUT',
      body: new Blob([body]),
    });
    expect(response.status).toBe(200);
    const eTag = response.headers.get('etag');
    expect(eTag).toBeTruthy();
    return eTag!;
  }

  async function uploadObject(key: string, secondPartSize = 1024) {
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    const part1 = new Uint8Array(MIN_PART_SIZE).fill(1);
    const part2 = new Uint8Array(secondPartSize).fill(2);
    const eTag1 = await putPart(key, uploadId, 1, part1);
    const eTag2 = await putPart(key, uploadId, 2, part2);
    await storage.completeMultipartUpload(key, uploadId, [
      { partNumber: 1, eTag: eTag1 },
      { partNumber: 2, eTag: eTag2 },
    ]);
    return { totalSize: MIN_PART_SIZE + secondPartSize };
  }

  it('should accept a PUT on a presigned part URL and return an ETag', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');

    const eTag = await putPart(
      key,
      uploadId,
      1,
      new Uint8Array(MIN_PART_SIZE).fill(1),
    );

    expect(eTag).toBeTruthy();
    await storage.abortMultipartUpload(key, uploadId);
  });

  it('should list the uploaded parts with partNumber and size', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    await putPart(key, uploadId, 1, new Uint8Array(MIN_PART_SIZE).fill(1));
    await putPart(key, uploadId, 2, new Uint8Array(1024).fill(2));

    const parts = await storage.listParts(key, uploadId);

    expect(parts.map((p) => [p.partNumber, p.size])).toEqual([
      [1, MIN_PART_SIZE],
      [2, 1024],
    ]);
    expect(parts.every((p) => p.eTag.length > 0)).toBe(true);
    await storage.abortMultipartUpload(key, uploadId);
  });

  it('should complete the multipart upload into an object with the summed size', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    const { totalSize } = await uploadObject(key);

    const url = await storage.presignGetObject(key);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(totalSize);
  });

  it('should serve a 206 with 100 bytes for a Range request on the presigned GET URL', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    await uploadObject(key);

    const url = await storage.presignGetObject(key);
    const response = await fetch(url, { headers: { Range: 'bytes=0-99' } });

    expect(response.status).toBe(206);
    expect((await response.arrayBuffer()).byteLength).toBe(100);
  });

  it('should answer with Content-Disposition attachment when a download name is given', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    await uploadObject(key);

    const url = await storage.presignGetObject(key, {
      downloadFileName: 'aula.mp4',
    });
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="aula.mp4"',
    );
  });

  it('should store an object written with putObject', async () => {
    const key = `test/${randomUUID()}/thumbnail.jpg`;

    await storage.putObject(key, Buffer.from([0xff, 0xd8, 0xff]), 'image/jpeg');

    const response = await fetch(await storage.presignGetObject(key));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
  });

  it('should fail to list parts after the multipart upload is aborted', async () => {
    const key = `test/${randomUUID()}/original.mp4`;
    const uploadId = await storage.createMultipartUpload(key, 'video/mp4');
    await storage.abortMultipartUpload(key, uploadId);

    await expect(storage.listParts(key, uploadId)).rejects.toMatchObject({
      name: 'NoSuchUpload',
    });
  });
});
