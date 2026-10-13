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
