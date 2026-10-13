import { randomBytes } from 'node:crypto';

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const PUBLIC_ID_LENGTH = 11;

// 256 % 62 = 8, so bytes >= 248 are discarded to avoid modulo bias.
const MAX_UNBIASED_BYTE = 256 - (256 % ALPHABET.length);

export function generatePublicId(): string {
  let id = '';
  while (id.length < PUBLIC_ID_LENGTH) {
    for (const byte of randomBytes(PUBLIC_ID_LENGTH * 2)) {
      if (byte < MAX_UNBIASED_BYTE) {
        id += ALPHABET[byte % ALPHABET.length];
        if (id.length === PUBLIC_ID_LENGTH) break;
      }
    }
  }
  return id;
}
