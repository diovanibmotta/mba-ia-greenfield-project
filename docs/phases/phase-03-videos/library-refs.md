---
libs:
  "bullmq":
    version: "6.3.11"
    context7_id: "/taskforcesh/bullmq"
    fetched_at: "2026-10-08T08:13:46-03:00"
  "@nestjs/bullmq":
    version: "unspecified"
    context7_id: "/nestjs/docs.nestjs.com"
    fetched_at: "2026-10-08T08:13:46-03:00"
  "@aws-sdk/client-s3":
    version: "unspecified"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-08T08:13:46-03:00"
  "@aws-sdk/s3-request-presigner":
    version: "unspecified"
    context7_id: "/aws/aws-sdk-js-v3"
    fetched_at: "2026-10-08T08:13:46-03:00"
sources_mtime:
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-08T07:48:15-03:00"
---

# Library refs — phase-03-videos

### bullmq

- Enqueue with retries: `queue.add(name, data, { attempts: N, backoff: { type: 'exponential', delay: 1000 } })` (1s, 2s, 4s...).
- Retry rule: job retried while `attemptsMade + 1 < attempts` and error is not `UnrecoverableError`; after that it moves to failed (use `UnrecoverableError` to skip retries, e.g. invalid file).
- Cleanup: `removeOnComplete` / `removeOnFail` accept boolean, count, or `{ age, count, limit }`; set on job opts or Worker opts.
- Worker: `new Worker(queueName, async job => {...}, { connection, concurrency })`; `failed` event fires when attempts are exhausted (hook for TD-08 status `erro`).

### @nestjs/bullmq

- `BullModule.forRoot({ connection: {...} })` once; `BullModule.registerQueue({ name: 'video-processing' })` per module.
- Producer: `constructor(@InjectQueue('name') private queue: Queue)`.
- Consumer: `@Processor('name') class X extends WorkerHost { async process(job: Job) {...} }`; must be a registered provider. Return value is stored on job.
- Dedicated worker entrypoint (TD-03): bootstrap an app context containing only the consumer module.

### @aws-sdk/client-s3

- Multipart by hand (TD-02): `CreateMultipartUploadCommand` -> presigned `UploadPartCommand` per part -> `ListPartsCommand` (sum sizes, TD-09) -> `CompleteMultipartUploadCommand`; `AbortMultipartUploadCommand` on cancel/failure.
- Min part size 5MB (last part exempt); max 10,000 parts.
- `Upload` from `@aws-sdk/lib-storage` is server-side only; not used for browser direct upload.

### @aws-sdk/s3-request-presigner

```ts
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const url = await getSignedUrl(client, new GetObjectCommand({ Bucket, Key }), { expiresIn: 3600 });
```

- Works with any command, including `UploadPartCommand` (per-part URL) and `GetObjectCommand` (stream/download, TD-07). Default `expiresIn` is 900s.
