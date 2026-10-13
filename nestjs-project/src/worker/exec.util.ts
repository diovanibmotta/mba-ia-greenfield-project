import { execFile } from 'node:child_process';

export interface ExecOptions {
  timeoutMs?: number;
  maxBuffer?: number;
  /** Strings (e.g. presigned URLs) scrubbed from error messages. */
  redact?: string[];
}

/** Runs a binary without a shell and resolves with its raw stdout. */
export function execFileBuffer(
  file: string,
  args: string[],
  options: ExecOptions = {},
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      file,
      args,
      {
        encoding: 'buffer',
        timeout: options.timeoutMs ?? 60_000,
        maxBuffer: options.maxBuffer ?? 16 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve(stdout);
          return;
        }
        const reason = error.killed
          ? 'timed out'
          : `exited with ${String(error.code)}`;
        const tail = stderr.toString().trim().slice(-500);
        reject(new Error(redact(`${file} ${reason}: ${tail}`, options.redact)));
      },
    );
  });
}

function redact(message: string, secrets: string[] = []): string {
  return secrets.reduce(
    (text, secret) => (secret ? text.split(secret).join('<redacted>') : text),
    message,
  );
}
