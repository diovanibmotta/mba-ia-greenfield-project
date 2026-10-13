export abstract class DomainException extends Error {
  constructor(
    public readonly errorCode: string,
    public readonly httpStatus: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class EmailAlreadyExistsException extends DomainException {
  constructor() {
    super('EMAIL_ALREADY_EXISTS', 409, 'Email is already registered');
  }
}

export class InvalidCredentialsException extends DomainException {
  constructor() {
    super('INVALID_CREDENTIALS', 401, 'Invalid email or password');
  }
}

export class EmailNotConfirmedException extends DomainException {
  constructor() {
    super('EMAIL_NOT_CONFIRMED', 403, 'Email address has not been confirmed');
  }
}

export class InvalidTokenException extends DomainException {
  constructor() {
    super('INVALID_TOKEN', 401, 'Token is invalid');
  }
}

export class TokenExpiredException extends DomainException {
  constructor() {
    super('TOKEN_EXPIRED', 401, 'Token has expired');
  }
}

export class TokenReuseDetectedException extends DomainException {
  constructor() {
    super(
      'TOKEN_REUSE_DETECTED',
      401,
      'Token reuse detected — all sessions revoked',
    );
  }
}

export class VideoNotFoundException extends DomainException {
  constructor() {
    super('VIDEO_NOT_FOUND', 404, 'Video not found');
  }
}

export class FileTooLargeException extends DomainException {
  constructor() {
    super('FILE_TOO_LARGE', 400, 'File exceeds the 10 GiB limit');
  }
}

export class UnsupportedMediaTypeException extends DomainException {
  constructor() {
    super(
      'UNSUPPORTED_MEDIA_TYPE',
      400,
      'Content type is not an allowed video container',
    );
  }
}

export class UploadSizeMismatchException extends DomainException {
  constructor() {
    super(
      'UPLOAD_SIZE_MISMATCH',
      400,
      'Uploaded size differs from the declared size',
    );
  }
}

export class InvalidPartNumberException extends DomainException {
  constructor() {
    super('INVALID_PART_NUMBER', 400, 'Part number out of range');
  }
}

export class InvalidPartListException extends DomainException {
  constructor() {
    super(
      'INVALID_PART_LIST',
      400,
      'Submitted parts do not match the uploaded parts',
    );
  }
}

export class InvalidUploadStateException extends DomainException {
  constructor() {
    super(
      'INVALID_UPLOAD_STATE',
      409,
      'Video is not in a state that accepts this upload operation',
    );
  }
}

export class VideoNotReadyException extends DomainException {
  constructor() {
    super('VIDEO_NOT_READY', 409, 'Video is not ready');
  }
}

export class CategoryNotFoundException extends DomainException {
  constructor() {
    super('CATEGORY_NOT_FOUND', 404, 'Category not found');
  }
}

export class CategoryRequiredException extends DomainException {
  constructor() {
    super('CATEGORY_REQUIRED', 400, 'Category is required to publish');
  }
}

export class VideoUploadInProgressException extends DomainException {
  constructor() {
    super('VIDEO_UPLOAD_IN_PROGRESS', 409, 'Video upload is still in progress');
  }
}

export class VideoAlreadyPublishedException extends DomainException {
  constructor() {
    super('VIDEO_ALREADY_PUBLISHED', 409, 'Video is already published');
  }
}

export class InvalidThumbnailException extends DomainException {
  constructor() {
    super(
      'INVALID_THUMBNAIL',
      400,
      'Thumbnail must be a valid JPEG, PNG or WebP image',
    );
  }
}

export class ThumbnailTooLargeException extends DomainException {
  constructor() {
    super('THUMBNAIL_TOO_LARGE', 413, 'Thumbnail exceeds the 2 MiB limit');
  }
}

export class NicknameAlreadyExistsException extends DomainException {
  constructor() {
    super('NICKNAME_ALREADY_EXISTS', 409, 'Nickname is already in use');
  }
}

export class ChannelNotFoundException extends DomainException {
  constructor() {
    super('CHANNEL_NOT_FOUND', 404, 'Channel not found');
  }
}

export class InvalidCursorException extends DomainException {
  constructor() {
    super('INVALID_CURSOR', 400, 'Cursor is invalid');
  }
}
