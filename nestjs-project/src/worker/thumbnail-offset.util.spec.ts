import { computeThumbnailOffset } from './thumbnail-offset.util';

describe('computeThumbnailOffset', () => {
  it('should use 10% of the duration', () => {
    expect(computeThumbnailOffset(100)).toBe(10);
    expect(computeThumbnailOffset(3600)).toBe(360);
  });

  it('should use at least 1 second', () => {
    expect(computeThumbnailOffset(5)).toBe(1);
    expect(computeThumbnailOffset(10)).toBe(1);
    expect(computeThumbnailOffset(1.5)).toBe(1);
  });

  it('should use the midpoint when the video is not longer than 1 second', () => {
    expect(computeThumbnailOffset(1)).toBe(0.5);
    expect(computeThumbnailOffset(0.5)).toBe(0.25);
  });
});
