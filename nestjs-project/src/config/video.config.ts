import { registerAs } from '@nestjs/config';

export default registerAs('video', () => ({
  maxSizeBytes: parseInt(process.env.VIDEO_MAX_SIZE_BYTES || '10737418240', 10),
  partSizeBytes: parseInt(process.env.VIDEO_PART_SIZE_BYTES || '16777216', 10),
  uploadAbandonDays: parseInt(process.env.VIDEO_UPLOAD_ABANDON_DAYS || '1', 10),
}));
