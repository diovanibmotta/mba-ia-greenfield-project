import type { Video } from './entities/video.entity';
import {
  derivePublicationState,
  isPublished,
  PublicationState,
} from './publication-state.util';
import { VideoStatus } from './video-status.enum';

const PUBLISHED_AT = new Date('2026-10-13T12:00:00.000Z');

type Input = Pick<Video, 'status' | 'published_at'>;

describe('derivePublicationState', () => {
  it.each<[string, Input, PublicationState]>([
    [
      'rascunho',
      { status: VideoStatus.DRAFT, published_at: null },
      PublicationState.UPLOADING,
    ],
    [
      'processando',
      { status: VideoStatus.PROCESSING, published_at: null },
      PublicationState.PROCESSING,
    ],
    [
      'erro',
      { status: VideoStatus.ERROR, published_at: null },
      PublicationState.ERROR,
    ],
    [
      'pronto sem published_at',
      { status: VideoStatus.READY, published_at: null },
      PublicationState.UNPUBLISHED,
    ],
    [
      'pronto com published_at',
      { status: VideoStatus.READY, published_at: PUBLISHED_AT },
      PublicationState.PUBLISHED,
    ],
  ])('should map %s', (_label, input, expected) => {
    expect(derivePublicationState(input)).toBe(expected);
  });

  it('should ignore published_at on non-ready videos', () => {
    expect(
      derivePublicationState({
        status: VideoStatus.PROCESSING,
        published_at: PUBLISHED_AT,
      }),
    ).toBe(PublicationState.PROCESSING);
  });
});

describe('isPublished', () => {
  it('should be true only for ready videos with published_at', () => {
    expect(
      isPublished({ status: VideoStatus.READY, published_at: PUBLISHED_AT }),
    ).toBe(true);
    expect(isPublished({ status: VideoStatus.READY, published_at: null })).toBe(
      false,
    );
    expect(
      isPublished({
        status: VideoStatus.PROCESSING,
        published_at: PUBLISHED_AT,
      }),
    ).toBe(false);
  });
});
