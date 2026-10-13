const MIN_OFFSET_SECONDS = 1;
const RELATIVE_POSITION = 0.1;

/**
 * Seek position for the thumbnail frame: 10% of the duration, at least 1s.
 * Videos too short for that (offset would land at or past the end) use their
 * midpoint so ffmpeg still has a frame to decode.
 */
export function computeThumbnailOffset(durationSeconds: number): number {
  const offset = Math.max(
    MIN_OFFSET_SECONDS,
    durationSeconds * RELATIVE_POSITION,
  );
  return offset >= durationSeconds ? durationSeconds / 2 : offset;
}
