import { Injectable } from '@nestjs/common';
import { execFileBuffer } from './exec.util';

const PROBE_TIMEOUT_MS = 60_000;
const INVALID_DATA_MARKER = 'Invalid data found when processing input';

/** The file was readable but is not decodable media (unlike an I/O or network failure). */
export class InvalidMediaError extends Error {
  constructor() {
    super('ffprobe could not read the file as media');
    this.name = 'InvalidMediaError';
  }
}

export interface VideoMetadata {
  container: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
  width: number | null;
  height: number | null;
  bitrate: number | null;
}

export interface ProbeResult {
  durationSeconds: number | null;
  hasVideoStream: boolean;
  metadata: VideoMetadata;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
}

interface FfprobeOutput {
  format?: { format_name?: string; duration?: string; bit_rate?: string };
  streams?: FfprobeStream[];
}

@Injectable()
export class VideoProbeService {
  /** Reads duration and technical metadata with ffprobe; `sourceUrl` may be a signed URL or a path. */
  async probe(sourceUrl: string): Promise<ProbeResult> {
    let stdout: Buffer;
    try {
      stdout = await execFileBuffer(
        'ffprobe',
        [
          '-v',
          'error',
          '-print_format',
          'json',
          '-show_format',
          '-show_streams',
          sourceUrl,
        ],
        { timeoutMs: PROBE_TIMEOUT_MS, redact: [sourceUrl] },
      );
    } catch (error) {
      if (String(error).includes(INVALID_DATA_MARKER)) {
        throw new InvalidMediaError();
      }
      throw error;
    }

    let output: FfprobeOutput;
    try {
      output = JSON.parse(stdout.toString()) as FfprobeOutput;
    } catch {
      throw new Error('ffprobe returned output that is not valid JSON');
    }

    const streams = output.streams ?? [];
    const video = streams.find((stream) => stream.codec_type === 'video');
    const audio = streams.find((stream) => stream.codec_type === 'audio');

    return {
      durationSeconds:
        toNumber(output.format?.duration) ?? toNumber(video?.duration),
      hasVideoStream: video !== undefined,
      metadata: {
        container: output.format?.format_name ?? null,
        videoCodec: video?.codec_name ?? null,
        audioCodec: audio?.codec_name ?? null,
        width: video?.width ?? null,
        height: video?.height ?? null,
        bitrate: toNumber(output.format?.bit_rate),
      },
    };
  }
}

function toNumber(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
