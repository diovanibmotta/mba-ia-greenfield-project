import { execFileBuffer } from './exec.util';
import { InvalidMediaError, VideoProbeService } from './video-probe.service';

jest.mock('./exec.util');

const mockedExec = jest.mocked(execFileBuffer);

function ffprobeJson(payload: unknown): Buffer {
  return Buffer.from(JSON.stringify(payload));
}

describe('VideoProbeService', () => {
  const service = new VideoProbeService();

  beforeEach(() => {
    mockedExec.mockReset();
  });

  it('should extract duration, stream flag and metadata from the ffprobe JSON', async () => {
    mockedExec.mockResolvedValue(
      ffprobeJson({
        format: {
          format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
          duration: '125.500000',
          bit_rate: '800000',
        },
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
          },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      }),
    );

    const result = await service.probe('https://storage/video.mp4?sig=abc');

    expect(result).toEqual({
      durationSeconds: 125.5,
      hasVideoStream: true,
      metadata: {
        container: 'mov,mp4,m4a,3gp,3g2,mj2',
        videoCodec: 'h264',
        audioCodec: 'aac',
        width: 1920,
        height: 1080,
        bitrate: 800000,
      },
    });
  });

  it('should call ffprobe without a shell and scrub the source from errors', async () => {
    mockedExec.mockResolvedValue(ffprobeJson({ streams: [] }));

    await service.probe('https://storage/video.mp4?sig=abc');

    expect(mockedExec).toHaveBeenCalledWith(
      'ffprobe',
      expect.arrayContaining([
        '-print_format',
        'json',
        'https://storage/video.mp4?sig=abc',
      ]),
      expect.objectContaining({
        redact: ['https://storage/video.mp4?sig=abc'],
      }),
    );
  });

  it('should flag a file without a video stream', async () => {
    mockedExec.mockResolvedValue(
      ffprobeJson({
        format: { duration: '3.0' },
        streams: [{ codec_type: 'audio', codec_name: 'aac' }],
      }),
    );

    const result = await service.probe('audio.m4a');

    expect(result.hasVideoStream).toBe(false);
    expect(result.durationSeconds).toBe(3);
    expect(result.metadata.videoCodec).toBeNull();
  });

  it('should fall back to the video stream duration', async () => {
    mockedExec.mockResolvedValue(
      ffprobeJson({
        format: {},
        streams: [{ codec_type: 'video', codec_name: 'vp9', duration: '9.25' }],
      }),
    );

    await expect(service.probe('v.webm')).resolves.toMatchObject({
      durationSeconds: 9.25,
    });
  });

  it('should return a null duration when none is reported', async () => {
    mockedExec.mockResolvedValue(
      ffprobeJson({ streams: [{ codec_type: 'video' }] }),
    );

    await expect(service.probe('v.mkv')).resolves.toMatchObject({
      durationSeconds: null,
    });
  });

  it('should reject when ffprobe fails', async () => {
    mockedExec.mockRejectedValue(new Error('ffprobe exited with 1'));

    await expect(service.probe('broken')).rejects.toThrow(
      'ffprobe exited with 1',
    );
  });

  it('should reject when the output is not JSON', async () => {
    mockedExec.mockResolvedValue(Buffer.from('not json'));

    await expect(service.probe('weird')).rejects.toThrow('not valid JSON');
  });

  it('should classify undecodable input as invalid media', async () => {
    mockedExec.mockRejectedValue(
      new Error(
        'ffprobe exited with 1: <redacted>: Invalid data found when processing input',
      ),
    );

    await expect(service.probe('notes.txt')).rejects.toBeInstanceOf(
      InvalidMediaError,
    );
  });
});
