import sharp from 'sharp';
import { InvalidThumbnailException } from '../common/exceptions/domain.exception';
import { ThumbnailImageService } from './thumbnail-image.service';

const config = {
  maxSizeBytes: 0,
  partSizeBytes: 0,
  thumbnailMaxBytes: 2097152,
  thumbnailMaxWidth: 1280,
  thumbnailMaxHeight: 720,
} as ConstructorParameters<typeof ThumbnailImageService>[0];

function image(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 3, background: '#cc3333' },
  });
}

describe('ThumbnailImageService (integration)', () => {
  const service = new ThumbnailImageService(config);

  it.each([
    ['jpeg', () => image(400, 300).jpeg().toBuffer()],
    ['png', () => image(400, 300).png().toBuffer()],
    ['webp', () => image(400, 300).webp().toBuffer()],
  ])('should accept %s and return a JPEG', async (_name, build) => {
    const output = await service.normalize(await build());

    expect(await sharp(output).metadata()).toMatchObject({
      format: 'jpeg',
      width: 400,
      height: 300,
    });
  });

  it('should shrink a large image to fit inside the limit keeping the ratio', async () => {
    const output = await service.normalize(
      await image(2000, 1500).png().toBuffer(),
    );

    expect(await sharp(output).metadata()).toMatchObject({
      width: 960,
      height: 720,
    });
  });

  it('should not enlarge a small image', async () => {
    const output = await service.normalize(
      await image(100, 80).png().toBuffer(),
    );

    expect(await sharp(output).metadata()).toMatchObject({
      width: 100,
      height: 80,
    });
  });

  it('should reject a text file', async () => {
    await expect(
      service.normalize(Buffer.from('not an image at all')),
    ).rejects.toBeInstanceOf(InvalidThumbnailException);
  });

  it('should reject an unsupported image format', async () => {
    const gif = await image(50, 50).gif().toBuffer();

    await expect(service.normalize(gif)).rejects.toBeInstanceOf(
      InvalidThumbnailException,
    );
  });

  it('should reject a truncated image', async () => {
    const png = await image(800, 600).png().toBuffer();

    await expect(
      service.normalize(png.subarray(0, Math.floor(png.length / 2))),
    ).rejects.toBeInstanceOf(InvalidThumbnailException);
  });
});
