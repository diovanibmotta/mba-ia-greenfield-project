import { InvalidCursorException } from '../exceptions/domain.exception';
import { decodeCursor, encodeCursor } from './cursor.util';

describe('cursor util', () => {
  const cursor = {
    publishedAt: new Date('2026-10-13T12:34:56.789Z'),
    id: '3f2b8a52-7c1d-4e0a-9d55-1a2b3c4d5e6f',
  };

  it('should round-trip a cursor', () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('should produce a url-safe opaque string', () => {
    expect(encodeCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['plain text', 'invalido'],
    ['empty', ''],
    ['invalid json', Buffer.from('not json', 'utf8').toString('base64url')],
    [
      'wrong shape',
      Buffer.from(JSON.stringify({ p: 1, i: 2 }), 'utf8').toString('base64url'),
    ],
    [
      'invalid date',
      Buffer.from(JSON.stringify({ p: 'nope', i: cursor.id }), 'utf8').toString(
        'base64url',
      ),
    ],
    [
      'invalid id',
      Buffer.from(
        JSON.stringify({ p: cursor.publishedAt.toISOString(), i: 'x' }),
        'utf8',
      ).toString('base64url'),
    ],
  ])('should reject a malformed cursor (%s)', (_name, value) => {
    expect(() => decodeCursor(value)).toThrow(InvalidCursorException);
  });
});
