import { randomUUID } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import storageConfig from '../config/storage.config';
import videoConfig from '../config/video.config';
import { StorageBootstrapService } from '../storage/storage-bootstrap.service';
import { StorageModule } from '../storage/storage.module';
import { StorageService } from '../storage/storage.service';
import { createNonMedia, createSampleVideo } from '../test/media-fixtures';
import { ThumbnailService } from './thumbnail.service';

describe('ThumbnailService (integration)', () => {
  let moduleRef: TestingModule;
  let storage: StorageService;
  let service: ThumbnailService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [storageConfig, videoConfig],
        }),
        StorageModule,
      ],
      providers: [ThumbnailService],
    }).compile();
    await moduleRef.get(StorageBootstrapService).ensureBucket();
    storage = moduleRef.get(StorageService);
    service = moduleRef.get(ThumbnailService);
  }, 60000);

  afterAll(async () => {
    await moduleRef.close();
  });

  async function fetchObject(key: string) {
    const response = await fetch(await storage.presignGetObject(key));
    return {
      response,
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  }

  it('should store a JPEG thumbnail with the image/jpeg content type', async () => {
    const source = await createSampleVideo(2);
    const key = `test/${randomUUID()}/thumbnail.jpg`;

    const stored = await service.generate({
      sourceUrl: source,
      durationSeconds: 2,
      destinationKey: key,
    });

    expect(stored).toBe(key);
    const { response, bytes } = await fetchObject(key);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  }, 60000);

  it('should also generate a thumbnail for a video shorter than 1 second', async () => {
    const source = await createSampleVideo(0.5);
    const key = `test/${randomUUID()}/thumbnail.jpg`;

    await service.generate({
      sourceUrl: source,
      durationSeconds: 0.5,
      destinationKey: key,
    });

    const { response, bytes } = await fetchObject(key);
    expect(response.status).toBe(200);
    expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  }, 60000);

  it('should overwrite the same key when run twice', async () => {
    const source = await createSampleVideo(2);
    const key = `test/${randomUUID()}/thumbnail.jpg`;
    const input = {
      sourceUrl: source,
      durationSeconds: 2,
      destinationKey: key,
    };

    await service.generate(input);
    await expect(service.generate(input)).resolves.toBe(key);

    const { response } = await fetchObject(key);
    expect(response.status).toBe(200);
  }, 60000);

  it('should fail without writing anything when the source is not media', async () => {
    const source = await createNonMedia();
    const key = `test/${randomUUID()}/thumbnail.jpg`;

    await expect(
      service.generate({
        sourceUrl: source,
        durationSeconds: 2,
        destinationKey: key,
      }),
    ).rejects.toThrow(/ffmpeg/);

    const { response } = await fetchObject(key);
    expect(response.status).toBe(404);
  }, 60000);
});
