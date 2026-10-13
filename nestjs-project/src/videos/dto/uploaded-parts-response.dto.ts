export class UploadedPartDto {
  partNumber: number;
  /** Size in bytes already stored for this part. */
  size: number;
  eTag: string;
}

export class UploadedPartsResponseDto {
  parts: UploadedPartDto[];
}
