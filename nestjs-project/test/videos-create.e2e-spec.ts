import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { DomainExceptionFilter } from '../src/common/filters/domain-exception.filter';
import { ValidationExceptionFilter } from '../src/common/filters/validation-exception.filter';
import { Video } from '../src/videos/entities/video.entity';
import { StorageService } from '../src/storage/storage.service';
import { cleanAllTables } from '../src/test/create-test-data-source';
import { createUserWithChannel } from '../src/test/video-fixtures';

type ErrorBody = { error: string; statusCode?: number; message?: unknown };
type CreateBody = {
  id: string;
  title: string;
  status: string;
  partSize: number;
  totalParts: number;
};

function bodyOf<T>(res: { body: unknown }): T {
  return res.body as T;
}

describe('videos-create (e2e)', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let jwtService: JwtService;
  let storage: StorageService;
  let throttlerStorage: ThrottlerStorageService;
  let token: string;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
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

    dataSource = moduleFixture.get(DataSource);
    jwtService = moduleFixture.get(JwtService);
    storage = moduleFixture.get(StorageService, { strict: false });
    throttlerStorage =
      moduleFixture.get<ThrottlerStorageService>(ThrottlerStorage);
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanAllTables(dataSource);
    throttlerStorage.storage.clear();
    const { user } = await createUserWithChannel(dataSource);
    token = await jwtService.signAsync({ sub: user.id, email: user.email });
  });

  const validBody = {
    fileName: 'aula.mp4',
    fileSize: 1073741824,
    contentType: 'video/mp4',
  };

  describe('1. Criação do upload', () => {
    it('1.1 create-draft-happy-path', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send(validBody)
        .expect(201);

      const body = bodyOf<CreateBody>(res);
      expect(body.id).toHaveLength(11);
      expect(body).toMatchObject({
        status: 'rascunho',
        title: 'aula',
        partSize: 16777216,
        totalParts: 64,
      });
      const row = await dataSource
        .getRepository(Video)
        .findOneByOrFail({ public_id: body.id });
      expect(row.upload_id).toBeTruthy();
      expect(row.storage_key).toBe(`videos/${row.id}/original.mp4`);
      await expect(
        storage.listParts(row.storage_key, row.upload_id!),
      ).resolves.toEqual([]);
    });

    it('1.2 create-draft-keeps-title', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, title: 'Minha aula' })
        .expect(201);

      expect(bodyOf<CreateBody>(res).title).toBe('Minha aula');
    });

    it('1.3 reject-file-too-large', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, fileSize: 10737418241 })
        .expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('FILE_TOO_LARGE');
    });

    it('1.4 reject-unsupported-media-type', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validBody, contentType: 'application/pdf' })
        .expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('1.5 reject-invalid-body', async () => {
      const res = await request(app.getHttpServer())
        .post('/videos')
        .set('Authorization', `Bearer ${token}`)
        .send({ fileSize: 1073741824, contentType: 'video/mp4' })
        .expect(400);

      expect(bodyOf<ErrorBody>(res).error).toBe('VALIDATION_ERROR');
    });

    it('1.6 reject-unauthenticated', async () => {
      await request(app.getHttpServer())
        .post('/videos')
        .send(validBody)
        .expect(401);
    });
  });
});
