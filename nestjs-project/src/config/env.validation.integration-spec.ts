import { envValidationSchema } from './env.validation';

const requiredEnv = {
  DB_USERNAME: 'user',
  DB_PASSWORD: 'pass',
  DB_NAME: 'db',
  JWT_SECRET: 'secret',
  JWT_REFRESH_SECRET: 'refresh-secret',
  STORAGE_ACCESS_KEY: 'access',
  STORAGE_SECRET_KEY: 'secret-key',
};

const validate = (env: Record<string, string>) =>
  envValidationSchema.validate(
    { ...requiredEnv, ...env },
    { allowUnknown: true, abortEarly: false },
  );

describe('envValidationSchema — SWAGGER_ENABLED', () => {
  it('should reject SWAGGER_ENABLED with an invalid value', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'invalid' });
    expect(error).toBeDefined();
    expect(error!.message).toContain('SWAGGER_ENABLED');
  });

  it('should accept SWAGGER_ENABLED=true', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'true' });
    expect(error).toBeUndefined();
  });

  it('should accept SWAGGER_ENABLED=false', () => {
    const { error } = validate({ SWAGGER_ENABLED: 'false' });
    expect(error).toBeUndefined();
  });

  it('should apply default false when SWAGGER_ENABLED is not set', () => {
    const result = validate({}) as {
      value: { SWAGGER_ENABLED: string };
      error?: unknown;
    };
    expect(result.error).toBeUndefined();
    expect(result.value.SWAGGER_ENABLED).toBe('false');
  });
});

describe('envValidationSchema — video storage and queue', () => {
  it('should reject a missing STORAGE_ACCESS_KEY', () => {
    const { error } = envValidationSchema.validate(
      { ...requiredEnv, STORAGE_ACCESS_KEY: undefined },
      { allowUnknown: true, abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('STORAGE_ACCESS_KEY');
  });

  it('should reject a missing STORAGE_SECRET_KEY', () => {
    const { error } = envValidationSchema.validate(
      { ...requiredEnv, STORAGE_SECRET_KEY: undefined },
      { allowUnknown: true, abortEarly: false },
    );
    expect(error).toBeDefined();
    expect(error!.message).toContain('STORAGE_SECRET_KEY');
  });

  it('should apply defaults for storage, queue and video variables', () => {
    const result = validate({}) as {
      value: Record<string, string | number>;
      error?: unknown;
    };
    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      STORAGE_ENDPOINT: 'http://minio:9000',
      STORAGE_REGION: 'us-east-1',
      STORAGE_BUCKET: 'streamtube-videos',
      STORAGE_FORCE_PATH_STYLE: 'true',
      STORAGE_PRESIGN_EXPIRES_SECONDS: 900,
      REDIS_HOST: 'redis',
      REDIS_PORT: 6379,
      VIDEO_PROCESSING_ATTEMPTS: 3,
      VIDEO_PROCESSING_BACKOFF_MS: 5000,
      VIDEO_WORKER_CONCURRENCY: 2,
      VIDEO_MAX_SIZE_BYTES: 10737418240,
      VIDEO_PART_SIZE_BYTES: 16777216,
      VIDEO_UPLOAD_ABANDON_DAYS: 1,
    });
  });

  it('should reject a part size below the 5 MiB S3 minimum', () => {
    const { error } = validate({ VIDEO_PART_SIZE_BYTES: '1048576' });
    expect(error).toBeDefined();
    expect(error!.message).toContain('VIDEO_PART_SIZE_BYTES');
  });
});
