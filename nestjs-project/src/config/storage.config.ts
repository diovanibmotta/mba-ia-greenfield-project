import { registerAs } from '@nestjs/config';

export default registerAs('storage', () => ({
  endpoint: process.env.STORAGE_ENDPOINT || 'http://minio:9000',
  publicEndpoint:
    process.env.STORAGE_PUBLIC_ENDPOINT ||
    process.env.STORAGE_ENDPOINT ||
    'http://minio:9000',
  region: process.env.STORAGE_REGION || 'us-east-1',
  bucket: process.env.STORAGE_BUCKET || 'streamtube-videos',
  accessKey: process.env.STORAGE_ACCESS_KEY!,
  secretKey: process.env.STORAGE_SECRET_KEY!,
  forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE || 'true') === 'true',
  presignExpiresSeconds: parseInt(
    process.env.STORAGE_PRESIGN_EXPIRES_SECONDS || '900',
    10,
  ),
}));
