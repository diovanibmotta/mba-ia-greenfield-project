import { registerAs } from '@nestjs/config';

export default registerAs('video', () => ({
  maxSizeBytes: parseInt(process.env.VIDEO_MAX_SIZE_BYTES || '10737418240', 10),
  partSizeBytes: parseInt(process.env.VIDEO_PART_SIZE_BYTES || '16777216', 10),
  uploadAbandonDays: parseInt(process.env.VIDEO_UPLOAD_ABANDON_DAYS || '1', 10),
  thumbnailMaxBytes: parseInt(
    process.env.VIDEO_THUMBNAIL_MAX_BYTES || '2097152',
    10,
  ),
  thumbnailMaxWidth: parseInt(
    process.env.VIDEO_THUMBNAIL_MAX_WIDTH || '1280',
    10,
  ),
  thumbnailMaxHeight: parseInt(
    process.env.VIDEO_THUMBNAIL_MAX_HEIGHT || '720',
    10,
  ),
}));
