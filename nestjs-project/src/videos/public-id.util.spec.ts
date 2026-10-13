import { generatePublicId, PUBLIC_ID_LENGTH } from './public-id.util';

describe('generatePublicId', () => {
  it('should return exactly 11 characters', () => {
    expect(PUBLIC_ID_LENGTH).toBe(11);
    expect(generatePublicId()).toHaveLength(11);
  });

  it('should only use base62 characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePublicId()).toMatch(/^[0-9A-Za-z]{11}$/);
    }
  });

  it('should produce distinct ids across many calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generatePublicId()));
    expect(ids.size).toBe(1000);
  });
});
