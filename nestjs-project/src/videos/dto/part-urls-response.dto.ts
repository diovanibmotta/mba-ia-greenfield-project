export class PartUrlDto {
  partNumber: number;
  /** Presigned PUT URL for this part. */
  url: string;
}

export class PartUrlsResponseDto {
  urls: PartUrlDto[];
  /** Seconds until the URLs expire. */
  expiresIn: number;
}
