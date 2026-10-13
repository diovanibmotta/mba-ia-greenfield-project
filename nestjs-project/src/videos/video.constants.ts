// Allowed video container MIME types and the file extension used in the
// storage key when the uploaded file name carries no usable extension.
export const ALLOWED_VIDEO_CONTENT_TYPES: Readonly<Record<string, string>> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
};

export const MAX_PART_URLS_PER_REQUEST = 100;
