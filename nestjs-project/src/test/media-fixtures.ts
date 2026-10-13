import { execFile } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function workDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'media-fixture-'));
}

/** Generates a small MP4 (video + audio) with ffmpeg and returns its path. */
export async function createSampleVideo(durationSeconds = 2): Promise<string> {
  const path = join(await workDir(), 'sample.mp4');
  await run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `testsrc=duration=${durationSeconds}:size=320x240:rate=15`,
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationSeconds}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-shortest',
    path,
  ]);
  return path;
}

/** Generates an audio-only file (no video stream). */
export async function createAudioOnly(durationSeconds = 2): Promise<string> {
  const path = join(await workDir(), 'audio.m4a');
  await run('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-f',
    'lavfi',
    '-i',
    `sine=frequency=440:duration=${durationSeconds}`,
    '-c:a',
    'aac',
    path,
  ]);
  return path;
}

/** Writes a text file that is not media at all. */
export async function createNonMedia(): Promise<string> {
  const path = join(await workDir(), 'notes.txt');
  await writeFile(path, 'this is not a video');
  return path;
}
