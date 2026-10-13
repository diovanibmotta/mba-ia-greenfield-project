import { InvalidCursorException } from '../exceptions/domain.exception';

export interface KeysetCursor {
  publishedAt: Date;
  id: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeCursor(cursor: KeysetCursor): string {
  const payload = { p: cursor.publishedAt.toISOString(), i: cursor.id };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): KeysetCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as { p?: unknown; i?: unknown };
    if (typeof parsed.p !== 'string' || typeof parsed.i !== 'string') {
      throw new Error('shape');
    }
    const publishedAt = new Date(parsed.p);
    if (Number.isNaN(publishedAt.getTime()) || !UUID_PATTERN.test(parsed.i)) {
      throw new Error('values');
    }
    return { publishedAt, id: parsed.i };
  } catch {
    throw new InvalidCursorException();
  }
}
