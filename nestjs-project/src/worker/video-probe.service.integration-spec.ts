import {
  createAudioOnly,
  createNonMedia,
  createSampleVideo,
} from '../test/media-fixtures';
import { InvalidMediaError, VideoProbeService } from './video-probe.service';

describe('VideoProbeService (integration)', () => {
  const service = new VideoProbeService();

  it('should probe a valid MP4 with ffprobe', async () => {
    const path = await createSampleVideo(2);

    const result = await service.probe(path);

    expect(result.hasVideoStream).toBe(true);
    expect(result.durationSeconds).toBeGreaterThan(1.5);
    expect(result.durationSeconds).toBeLessThan(3);
    expect(result.metadata).toMatchObject({
      videoCodec: 'h264',
      audioCodec: 'aac',
      width: 320,
      height: 240,
    });
  }, 60000);

  it('should report no video stream for an audio-only file', async () => {
    const path = await createAudioOnly(2);

    const result = await service.probe(path);

    expect(result.hasVideoStream).toBe(false);
    expect(result.durationSeconds).toBeGreaterThan(0);
  }, 60000);

  it('should reject a file that is not media', async () => {
    const path = await createNonMedia();

    await expect(service.probe(path)).rejects.toBeInstanceOf(InvalidMediaError);
  }, 60000);
});
