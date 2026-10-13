import { randomBytes } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../../src/common/filters/validation-exception.filter';
import { StorageService } from '../../src/storage/storage.service';
import { Video } from '../../src/videos/entities/video.entity';
import { cleanAllTables } from '../../src/test/create-test-data-source';
import { createUserWithChannel } from '../../src/test/video-fixtures';
import type { UserWithChannel } from '../../src/test/video-fixtures';

export interface VideoE2eContext {
  app: INestApplication<App>;
  dataSource: DataSource;
  storage: StorageService;
  /** Wipes the tables and the throttler counters; call from beforeEach. */
  reset: () => Promise<void>;
  /** Creates a user with a channel and a signed access token. */
  createOwner: () => Promise<UserWithChannel & { token: string }>;
}

export async function bootstrapVideoE2e(): Promise<VideoE2eContext> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(
    new DomainExceptionFilter(),
    new ValidationExceptionFilter(),
  );
  await app.init();

  const dataSource = moduleFixture.get(DataSource);
  const jwtService = moduleFixture.get(JwtService);
  const storage = moduleFixture.get(StorageService, { strict: false });
  const throttlerStorage =
    moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);

  return {
    app,
    dataSource,
    storage,
    reset: async () => {
      await cleanAllTables(dataSource);
      throttlerStorage.storage.clear();
    },
    createOwner: async () => {
      const created = await createUserWithChannel(dataSource);
      const token = await jwtService.signAsync({
        sub: created.user.id,
        email: created.user.email,
      });
      return { ...created, token };
    },
  };
}

export interface UploadedDraft {
  publicId: string;
  parts: { partNumber: number; eTag: string }[];
}

/**
 * Starts an upload through the API and PUTs the given part sizes to storage.
 * `declaredSize` defaults to the sum of the sizes.
 */
export async function createUploadedDraft(
  ctx: VideoE2eContext,
  token: string,
  partSizes: number[],
  declaredSize = partSizes.reduce((sum, size) => sum + size, 0),
): Promise<UploadedDraft> {
  const created = await request(ctx.app.getHttpServer())
    .post('/videos')
    .set('Authorization', `Bearer ${token}`)
    .send({
      fileName: 'aula.mp4',
      fileSize: declaredSize,
      contentType: 'video/mp4',
    })
    .expect(201);
  const publicId = (created.body as { id: string }).id;

  const signed = await request(ctx.app.getHttpServer())
    .post(`/videos/${publicId}/upload/part-urls`)
    .set('Authorization', `Bearer ${token}`)
    .send({ partNumbers: partSizes.map((_, index) => index + 1) })
    .expect(200);
  const urls = (signed.body as { urls: { partNumber: number; url: string }[] })
    .urls;

  const parts: UploadedDraft['parts'] = [];
  for (const [index, { partNumber, url }] of urls.entries()) {
    const response = await fetch(url, {
      method: 'PUT',
      body: new Blob([new Uint8Array(partSizes[index]).fill(index + 1)]),
    });
    parts.push({ partNumber, eTag: response.headers.get('etag')! });
  }
  return { publicId, parts };
}

/** Inserts a video row directly, bypassing the upload flow. */
export async function insertVideo(
  ctx: VideoE2eContext,
  channelId: string,
  overrides: Partial<Video> = {},
): Promise<Video> {
  const repository = ctx.dataSource.getRepository(Video);
  return repository.save(
    repository.create({
      public_id: randomBytes(8).toString('hex').slice(0, 11),
      channel_id: channelId,
      title: 'Aula',
      file_name: 'aula.mp4',
      content_type: 'video/mp4',
      declared_size: 1000,
      size_bytes: 1000,
      storage_key: 'videos/some/original.mp4',
      ...overrides,
    }),
  );
}
