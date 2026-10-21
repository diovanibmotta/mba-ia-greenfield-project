# phase-03-videos — Progress

**Status:** completed
**SIs:** 14/14 completed

### SI-03.1 — Infra: dependências, configuração e Docker Compose
- **Status:** completed
- **Tests:** 11 passing (`src/config`: env.validation integration + swagger config spec); `npx tsc --noEmit` clean
- **Observations:**
  - MinIO images `minio/minio` (Docker Hub) and `quay.io/minio/*` are no longer pullable; Compose uses `cgr.dev/chainguard/minio:latest`. That image is distroless: no healthcheck (`minio` is `service_started`) and no `mc`, so the planned `createbuckets` init job was dropped — the bucket must be created by `StorageBootstrapService` (SI-03.3), which needs a startup retry because MinIO may still be booting.
  - `video-worker` runs `npm run start:worker:dev` (script added in SI-03.9) and starts with the default `docker compose up -d` (the temporary `worker` profile was removed after review).
  - Added optional `STORAGE_PUBLIC_ENDPOINT` (not in the plan) so presigned URLs can use a host reachable outside the Docker network; defaults to `STORAGE_ENDPOINT`.
  - Installed `bullmq ^6.3.14`, `@nestjs/bullmq ^12.0.0` (later replaced by `^11.0.5` plus `ioredis`, see SI-03.7), `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner ^3.1150.0`.
  - `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` are now required; local gitignored `.env` was updated, and CI/other environments must define them.
  - Container is slow on this machine (jest ~90s, app bootstrap ~70s).

### SI-03.2 — Criar entidade Video, enum de status e gerador de public_id
- **Status:** completed
- **Tests:** 11 passing (video entity integration, public-id util, migrations integration); tsc clean; schema:log in sync
- **Observations:**
  - Migration `1791900000000-CreateVideos` was hand-written with explicit constraint/index names (`PK_videos`, `IDX_videos_*`, `FK_videos_channel_id`) declared on the entity too; `typeorm schema:log` reports the schema in sync with the entity. An explicit `enumName` on the status column made TypeORM report a false enum diff, so it was dropped (default name is already `videos_status_enum`).
  - `Channel` now has a `videos` relation, so every test DataSource that registers `Channel` must also register `Video`; added `Video` to `ALL_ENTITIES` in 10 existing specs. `cleanAllTables` also deletes `videos` (guarded by `to_regclass`) before `channels`.
  - `migrations.integration-spec.ts` now expects 3 migrations / 5 tables and has a separate revert test per migration.
  - `bigint`/`numeric` columns use a transformer so they come back as numbers.
  - Prettier (container) rewrote line endings to LF in files it touched; HEAD already stores LF, so `git diff --ignore-space-at-eol` shows only the intended changes.

### SI-03.3 — Criar StorageModule (cliente S3, multipart, URLs assinadas e bucket)
- **Status:** completed
- **Tests:** 14 passing (storage service + bootstrap integration, bootstrap unit, module compile); tsc clean
- **Observations:**
  - Local MinIO rejects a lifecycle rule that only carries `AbortIncompleteMultipartUpload` (`InvalidArgument`; it requires an expiration/transition action). `StorageBootstrapService.ensureLifecycle()` logs a warning and returns `false` instead of failing; the rule is only applied on real S3. The "lifecycle for abandoned uploads" of TD-02 is therefore NOT active in local dev.
  - Added a second S3 client (`S3_PRESIGN_CLIENT`) pointing at `STORAGE_PUBLIC_ENDPOINT`, used only to sign URLs; both clients set `requestChecksumCalculation/responseChecksumValidation: 'WHEN_REQUIRED'` so presigned `UploadPart` URLs do not embed CRC32 checksums that plain browser PUTs would not send.
  - `ensureBucket()` retries up to 10×2s so the app tolerates MinIO still booting (no healthcheck on the distroless image).
  - Extra test file not in the plan: `src/storage/storage-bootstrap.service.spec.ts` (mocked client) covers the lifecycle rule content, since the integration test cannot assert it against MinIO.
  - Services import `S3Client`/`ConfigType` with `import type` (required by `isolatedModules` + `emitDecoratorMetadata`).

### SI-03.4 — Endpoint POST /videos
- **Status:** completed
- **Tests:** 29 passing (service unit 11 + integration 2 + module 1 in src/videos; e2e videos-create 6 incl. earlier suites in src/videos); tsc clean
- **Observations:**
  - Authored `test/videos-create.e2e-spec.ts` from `nestjs-project/specs/videos-create.plan.md` (6 scenarios). E2E tokens are signed directly with `JwtService` for a user/channel created through `src/test/video-fixtures.ts` (new shared helper), and the throttler storage is cleared per test.
  - `FILE_TOO_LARGE`/`UNSUPPORTED_MEDIA_TYPE` are domain checks in `VideosService` (not DTO validators) so they return the catalog error codes instead of `VALIDATION_ERROR`; the DTO only enforces `fileSize` as an integer ≥ 1.
  - All 8 video domain exceptions from the Error Catalog were added to `domain.exception.ts` here so later SIs only import them. Note `UnsupportedMediaTypeException` shares its name with the NestJS built-in; import it from `domain.exception`.
  - Channel is resolved with `Repository<Channel>` (exported by `ChannelsModule`) instead of adding a method to `ChannelsService`.
  - Allowed content types (mp4, quicktime, matroska, webm, x-msvideo) live in `video.constants.ts`; extension of the storage key comes from the file name, falling back to the content type.
  - E2E suite is slow in this container (~150s for 6 tests, mostly AppModule boot + ts-jest).
  - Swagger plugin metadata/`openapi.json` export not yet checked for the new route; verify during final verification.

### SI-03.5 — Endpoint POST /videos/:publicId/upload/part-urls
- **Status:** completed
- **Tests:** 32 passing (videos.service unit+integration 26, e2e videos-part-urls 6); tsc clean
- **Observations:**
  - `PartUrlsDto` does not apply `@Min(1)` per element: the spec/AC require `partNumbers: [0]` to return `400 INVALID_PART_NUMBER` (domain error), so the range check against `totalParts` lives in the service. The DTO still enforces a non-empty integer array of at most 100 items.
  - `VideosService.findOwnedVideo` returns `VIDEO_NOT_FOUND` both for unknown videos and for videos of other channels (and for users without a channel); `requireOpenUpload` (private) is the shared draft + open-multipart guard for the upload endpoints.
  - `totalParts` is recomputed from `declared_size` and the current `VIDEO_PART_SIZE_BYTES`; the part size is not stored per video, so changing that env var mid-upload would shift the valid range.
  - `StorageService` gained a `presignExpiresSeconds` getter so the API can report `expiresIn` without injecting the storage config into `VideosService`.
  - Added `test/support/video-e2e.ts` (shared AppModule bootstrap, per-test reset and owner/token factory) used by the new e2e suites; `videos-create.e2e-spec.ts` still uses its own inline bootstrap.

### SI-03.6 — Endpoint GET /videos/:publicId/upload/parts
- **Status:** completed
- **Tests:** 5 e2e (videos-list-parts) + service unit/integration passing; tsc clean
- **Observations:**
  - Authored `test/videos-list-parts.e2e-spec.ts` from `nestjs-project/specs/videos-list-parts.plan.md` (5 scenarios).
  - The response lists every stored part with `partNumber`, `size` and the storage `eTag` as returned by S3 (quoted).

### SI-03.7 — Endpoint POST /videos/:publicId/upload/complete
- **Status:** completed
- **Tests:** videos.service 44 passing (unit+integration), queue module spec, e2e videos-complete 6; tsc clean
- **Observations:**
  - Dependency correction vs SI-03.1: `@nestjs/bullmq@12` is ESM-only and cannot be `require`d by this CommonJS Nest 11 project (`Unexpected token 'export'` under jest/tsc output), so the project pins `@nestjs/bullmq ^11.0.5`. `bullmq@6` also treats `ioredis` as an optional peer, so `ioredis ^5` was added (not in the plan's library list).
  - The queue lives in `src/queue/` (`queue.constants.ts`, `video-queue.module.ts`); `VideoQueueModule` is imported by `VideosModule` (and will be by `WorkerModule`) instead of being registered directly in `AppModule`, so `BullModule.forRootAsync` runs once per app.
  - `completeUpload` order: owner/state check → compare submitted parts with `ListParts` (ETags compared ignoring quotes, duplicate part numbers rejected) → size checks → `CompleteMultipartUpload` → row to `processando` → enqueue. `FILE_TOO_LARGE` is checked before `UPLOAD_SIZE_MISMATCH`; both abort the multipart and null `upload_id`, leaving the draft row in `rascunho` with no open upload (later upload calls return `INVALID_UPLOAD_STATE`; it is not deleted).
  - If the enqueue fails after the row became `processando`, the row is set to `erro` / `PROCESSING_FAILED` and the original error is rethrown (500).
  - Job options use `attempts` and exponential `backoff` from `queue.config`; `removeOnComplete/removeOnFail` are left for the worker side (SI-03.11).
  - Tests that need two parts must declare more than `VIDEO_PART_SIZE_BYTES` (16 MiB) because `totalParts` bounds the part numbers: the suites declare 17 MiB (5 MiB + 12 MiB parts). The `FILE_TOO_LARGE` e2e mutates `maxSizeBytes` on the injected video config object and restores it in `finally`.
  - Authored `test/videos-complete.e2e-spec.ts` (6 scenarios) and added the `createUploadedDraft` helper in `test/support/video-e2e.ts`.

### SI-03.8 — Endpoint DELETE /videos/:publicId/upload
- **Status:** completed
- **Tests:** 50 passing (videos.service unit+integration) + e2e videos-cancel-upload 4; tsc clean
- **Observations:**
  - Authored `test/videos-cancel-upload.e2e-spec.ts` from `nestjs-project/specs/videos-cancel-upload.plan.md` (4 scenarios).
  - `cancelUpload` aborts the multipart first and only then deletes the row, so a storage failure leaves the draft intact and the call can be retried; a draft without `upload_id` (after an aborted complete) is simply deleted.

### SI-03.9 — Worker: entrypoint dedicado e extração de metadados com ffprobe
- **Status:** completed
- **Tests:** 12 passing (probe unit 7 + integration 3, worker module compile, app controller); tsc clean; video-worker container initializes
- **Observations:**
  - `docker compose up -d video-worker` runs the NestJS application context (log `Video worker context initialized`), no published port; first compile in the container takes ~6 minutes, so wait before checking logs.
  - Extracted the TypeORM root connection to `src/database/typeorm-root.ts` (`typeOrmRoot`), now used by both `AppModule` and `WorkerModule`. `WorkerModule` registers `Video`, `Channel` and `User` via `forFeature` because `Video` → `Channel` → `User` relations need all three in the metadata.
  - `exec.util.ts` (`execFileBuffer`) runs binaries without a shell and scrubs the source URL from error messages (presigned URLs carry signatures); `VideoProbeService` and the future `ThumbnailService` share it. `src/test/media-fixtures.ts` generates sample MP4 / audio-only / non-media files with ffmpeg for integration tests.
  - `StorageBootstrapService` logs the lifecycle-rule warning again in the worker (MinIO limitation, see SI-03.3).
  - `probe()` returns `durationSeconds: null` when ffprobe reports none; the processor (SI-03.11) decides what to do with that.

### SI-03.10 — Gerar thumbnail a partir de um frame do vídeo
- **Status:** completed
- **Tests:** 18 passing in src/worker (offset util 3, thumbnail integration 4, probe, worker module); tsc clean
- **Observations:**
  - `computeThumbnailOffset` returns the video midpoint when 10%/1s would land at or beyond the end (videos of 1s or less), instead of clamping to the exact duration, because seeking to the last instant can yield no decodable frame.
  - `ThumbnailService` pipes a single MJPEG frame from `ffmpeg` (`-ss` before `-i` for fast seeking on signed URLs) straight into `StorageService.putObject`; errors never include the signed URL (`redact`).
  - Test fixtures are generated at runtime with ffmpeg (libx264/aac) under the OS temp dir; no binary fixtures are committed.

### SI-03.11 — Processador de vídeos: metadados, thumbnail, status e falha
- **Status:** completed
- **Tests:** 36 passing in src/worker (processor unit 14, processor integration 4, probe, thumbnail, module); tsc clean
- **Observations:**
  - Added `InvalidMediaError` (thrown by `VideoProbeService` when ffprobe reports `Invalid data found when processing input`) so garbage files fail as `INVALID_MEDIA` on the first attempt instead of burning all retries as `PROCESSING_FAILED`; I/O and network errors still retry. A video stream with no readable duration is also treated as `INVALID_MEDIA`.
  - The `failed` handler decides finality as `error is UnrecoverableError || attemptsMade >= opts.attempts`, and updates are scoped to rows still `processando` (`update({ id, status })`) so a late event cannot overwrite a `pronto` video.
  - `process` re-checks `status = processando` first, making redelivered jobs idempotent (verified against a `pronto` row in the integration test).
  - Worker options: `removeOnComplete {age: 1h, count: 1000}`, `removeOnFail {age: 7d}`; concurrency is applied from `VIDEO_WORKER_CONCURRENCY` in `onApplicationBootstrap` (BullMQ worker setter).
  - Read URL for ffprobe/ffmpeg is a 1h presigned GET signed against `STORAGE_PUBLIC_ENDPOINT`, so in production that endpoint must be reachable from the worker.
  - Integration test runs a real worker against PostgreSQL, MinIO and Redis (4 scenarios, ~30s). Do not leave a `video-worker` container running while the e2e/integration suites run: it would consume the same `video-processing` queue.

### SI-03.12 — Endpoint GET /videos/:publicId
- **Status:** completed
- **Tests:** 80 passing in src/auth/guards + src/videos (guard 4, service unit+integration, module) + e2e videos-get 7; tsc clean
- **Observations:**
  - Optional auth is `@OptionalAuth()` = `@Public()` + `@UseGuards(OptionalJwtGuard)`: the global `JwtAuthGuard` skips `@Public()` routes, so the route-level guard parses the bearer token when present and silently treats a missing/invalid token as anonymous. `OptionalJwtGuard` is provided and exported by `AuthModule`; `VideosModule` now imports `AuthModule`, so `VideosModule` specs must load `appConfig`, `authConfig` and `mailConfig` (updated in `videos.module.spec.ts` and `videos.service.integration-spec.ts`).
  - Visibility rule lives in the private `findVisibleVideo` (reused by stream/download): `pronto` is public; any other status only for the owning channel, otherwise `VIDEO_NOT_FOUND`. `errorReason` is only returned to the owner of a video in `erro`; `thumbnailUrl` is a presigned GET generated on each request.
  - Authored `test/videos-get.e2e-spec.ts` (7 scenarios) and the `insertVideo` helper in `test/support/video-e2e.ts`.

### SI-03.13 — Endpoint GET /videos/:publicId/stream
- **Status:** completed
- **Tests:** 71 passing in videos.service (unit+integration) + e2e videos-stream 4; tsc clean
- **Observations:**
  - Authored `test/videos-stream.e2e-spec.ts` (4 scenarios, includes a real `Range: bytes=0-99` request returning 206 with 100 bytes).
  - `VideosService.getPlaybackUrl(publicId, userId, { download })` is shared with SI-03.14: it reuses `findVisibleVideo`, throws `VIDEO_NOT_READY` for the owner of a non-ready video and signs `storage_key` with the shared presign TTL.

### SI-03.14 — Endpoint GET /videos/:publicId/download
- **Status:** completed
- **Tests:** videos.service unit+integration + e2e videos-download 3; tsc clean
- **Observations:**
  - Authored `test/videos-download.e2e-spec.ts` (3 scenarios, checks `Content-Disposition: attachment; filename="aula.mp4"` and full body size).
  - File-name sanitising is done once in `StorageService` (`"`, `\`, CR/LF → `_`; non-ASCII gets an ASCII fallback plus `filename*=UTF-8''…`), covered by the playback integration test (`a"b.mp4` → `filename="a_b.mp4"`); `VideosService` just passes `video.file_name`.
  - Final verification (whole plan): `tsc --noEmit` clean, `npm run build` ok, `npm test -- --runInBand` 41 suites / 284 tests passing, `npm run test:e2e -- --runInBand` 11 suites / 93 tests passing, `openapi.json` regenerated (+8 `/videos` paths).
  - Cross-cutting: `test/jest-e2e.json` now sets `testTimeout: 60000` — booting `AppModule` (now with Redis, MinIO bootstrap and BullMQ) exceeds Jest's default 5s `beforeAll` timeout in the existing auth/app/swagger e2e suites.
  - Running Prettier over `src`/`test` in the container normalised line endings (HEAD stores LF) and reformatted two Handlebars templates; those were reverted, so use `git diff --ignore-space-at-eol` to see real changes.
  - Follow-ups outside this plan: CI and any other environment must define `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` and provide Redis and an S3-compatible store; the abandoned-multipart lifecycle rule is not applied on local MinIO; stop `video-worker` before running the integration/e2e suites, since it consumes the same queue.
