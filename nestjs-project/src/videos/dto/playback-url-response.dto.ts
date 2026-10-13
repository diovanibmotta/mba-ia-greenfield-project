export class PlaybackUrlResponseDto {
  /** Presigned GET URL served directly by object storage (supports Range). */
  url: string;
  /** Seconds until the URL expires. */
  expiresIn: number;
}
