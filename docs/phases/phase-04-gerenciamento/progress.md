# phase-04-gerenciamento — Progress

**Status:** completed
**SIs:** 13/13 completed

### SI-04.1 — Infra: sharp, tipos do Multer, configuração de thumbnail e exceções de domínio
- **Status:** completed
- **Tests:** 29 passing (env validation 12 + domain filter 17); tsc clean; sharp loads on Node 25; bootstrap rejects VIDEO_THUMBNAIL_MAX_BYTES=0; app e2e GET / ok
- **Observations:**
  - Worktree setup: the fresh worktree had no `node_modules` or `.env`; copied the git-ignored `.env` from the Phase 03 worktree and ran `npm ci` in the container (the compose stack was recreated from the new worktree path; the DB container and its data were kept).
  - `sharp ^0.35.5` loads on Node 25.6 (prebuilt binary; `sharp({create…}).jpeg().toBuffer()` smoke test OK). `@types/multer ^2.3.0` added as devDependency.
  - Existing specs that build a plain `video` config object (`videos.service.spec.ts`, `storage-bootstrap.service.spec.ts`) needed the three new thumbnail fields to keep compiling.
  - Prettier was run only on the files touched (not on all of `src`), to avoid the line-ending churn seen in Phase 03.
  - TaskCreate/TaskUpdate are not available in this harness, so progress is tracked only in this file.

### SI-04.2 — Criar entidade Category e migration com seed
- **Status:** completed
- **Tests:** 8 passing (category entity integration 2 + migrations integration 6); tsc clean
- **Observations:**
  - Migration `1792000000000-CreateCategories` seeds the eight categories with plain `INSERT`s (parameterised) inside `up`; slugs are accent-free kebab-case and `sort_order` is 1–8 with `Outros` last.
  - `Category` entity integration test uses `synchronize: true` and cleans only its own `test-category` rows, so it never deletes the migration-seeded rows from the shared test DB.
  - `migrations.integration-spec.ts` now covers 4 migrations, the seed content/order, the unique `slug` and the revert of `CreateCategories`.

### SI-04.3 — Colunas de edição, publicação e contadores em Video
- **Status:** completed
- **Tests:** 20 passing (video entity 10, migrations 9, category entity 2 across the three suites run); tsc clean; schema:log in sync
- **Observations:**
  - Migration `1792100000000-AddVideoManagementColumns` (timestamp after `CreateCategories`): enum `videos_visibility_enum`, 8 columns, `FK_videos_category_id` (`ON DELETE RESTRICT`), `IDX_videos_category_id`, `IDX_videos_channel_published` and the backfill `published_at = updated_at` for `status = 'pronto'`. `typeorm schema:log` reports the schema in sync with the entities.
  - `Category` must be registered wherever `Video` is (Video → Category relation): added to the 10+ `ALL_ENTITIES` lists, `WorkerModule`, the processor integration spec and — earlier than the plan's SI-04.6 — `VideosModule`'s `TypeOrmModule.forFeature`, otherwise the app fails to build entity metadata.
  - The `Category` entity spec had to switch from `[Category]` to the full entity list for the same reason.
  - Migrations spec now has a backfill test (revert the management migration, insert a user/channel and videos in every status with raw SQL, re-run and assert) and a revert test for the new columns/enum.

### SI-04.4 — Endpoint GET /categories
- **Status:** completed
- **Tests:** 5 passing in src/categories (service integration 2, module 1, entity 2) + e2e categories-list 1; tsc clean
- **Observations:**
  - Authored `test/categories-list.e2e-spec.ts` from `nestjs-project/specs/categories-list.plan.md` (1 scenario covering the three ACs).
  - `CategoriesService` integration test depends on the migration seed being present in the shared test DB (the migrations spec re-applies migrations in its `afterAll`); a brand-new DB that only ran `synchronize`-based specs would have an empty `categories` table.
  - The endpoint returns the `{ items }` envelope from the API Contracts and is `@Public()`.

### SI-04.5 — Regra de acesso por publicação e publicationState
- **Status:** completed
- **Tests:** 99 passing in src/videos (publication-state util 7 + service unit/integration) + e2e publication-access 8 and Phase 03 get/stream/download 14; tsc clean
- **Observations:**
  - `findVisibleVideo` now loads the `category` relation (`findOne` instead of `findOneBy`), so the Phase 03 unit mocks for `getVideo`/`getPlaybackUrl` were rewritten around `videos.findOne`; the `getVideo`/`getPlaybackUrl` blocks of the unit and integration specs were replaced wholesale with versions covering the publication rule.
  - Access rule lives in `isPublished()` (`publication-state.util.ts`): `status = 'pronto'` and `published_at` set. The owner can now stream/download a `pronto` video that is not published yet (previews), while non-owners get 404.
  - `insertVideo` in `test/support/video-e2e.ts` now defaults `published_at = new Date()` for `status = pronto` unless overridden, so the Phase 03 e2e suites (`videos-get`, `videos-stream`, `videos-download`) kept passing unchanged.
  - `VideoResponseDto` grew `description`, `publicationState`, `visibility`, `publishedAt`, `category` and the four counters; the response mapping is the private `toResponse()` reused by the next SIs.
  - Authored `test/videos-publication-access.e2e-spec.ts` (8 scenarios).

### SI-04.6 — Endpoint PATCH /videos/:publicId
- **Status:** completed
- **Tests:** 100 passing (videos.service unit+integration) + 9 e2e
- **Observations:**
`categories` Repository added as LAST constructor param of VideosService (existence check for categoryId).
`assertEditable` blocks DRAFT videos with open upload_id (VideoUploadInProgressException).
Empty body rejected with BadRequestException (VALIDATION_ERROR).
test/videos-update.e2e-spec.ts authored from specs/videos-update.plan.md.

### SI-04.7 — Endpoint POST /videos/:publicId/publish
- **Status:** completed
- **Tests:** 101 passing (videos.service unit+integration) + 9 e2e
- **Observations:**
PublishVideoDto visibility optional; published_at stamped in same UPDATE as visibility.
Order of checks: ownership, READY status, already published, category required.
test/videos-publish.e2e-spec.ts authored from specs/videos-publish.plan.md.
Env note: tests must run inside nestjs-api container (hosts db/redis/minio); host-side npm ci corrupts shared Linux node_modules, was reinstalled in container.

### SI-04.8 — Endpoint PUT /videos/:publicId/thumbnail
- **Status:** completed
- **Tests:** 136 passing (src/videos) + 7 e2e
- **Observations:**
ThumbnailUploadInterceptor extends FileInterceptor('file') and maps Multer PayloadTooLarge/BadRequest to ThumbnailTooLarge/InvalidThumbnail domain exceptions.
ThumbnailImageService appended as LAST VideosService constructor param; MulterModule.registerAsync limits fileSize to thumbnailMaxBytes.
Response is { thumbnailUrl } (ThumbnailResponseDto). 2000x1500 input becomes 960x720 (fit inside 1280x720).
Env note: run jest inside nestjs-api container (docker exec); never npm ci from Windows host.

### SI-04.9 — Endpoint GET /me/channel
- **Status:** completed
- **Tests:** 198 passing (src/channels, videos.service, auth) + 3 e2e
- **Observations:**
MyChannelController (GET+PATCH /me/channel) registered in ChannelsModule; ChannelsService uses dataSource.getRepository(Channel) so its constructor is unchanged.
test/me-channel-get.e2e-spec.ts authored from specs/me-channel-get.plan.md.

### SI-04.10 — Endpoint PATCH /me/channel
- **Status:** completed
- **Tests:** unit+integration passing + 9 e2e
- **Observations:**
pg-errors.util moved to src/common/database via git mv; ChannelsService duplicate helper removed.
Empty body -> BadRequestException (same pattern as updateVideo); same nickname is a no-op returning the current channel.
src/auth/auth.service.integration-spec.ts beforeAll can exceed 5s default timeout on cold ts-jest cache in container (passes with --testTimeout=60000); not a regression.

### SI-04.11 — Endpoint GET /me/videos
- **Status:** completed
- **Tests:** 119 passing (videos.service) + 8 e2e
- **Observations:**
Added PageQueryDto/page-response in src/common/pagination; MyVideosController registered in VideosModule.
Sort uses a whitelist map to columns with NULLS LAST and id tiebreaker; publicationState mapped to status/published_at conditions.
Unit spec mocks the QueryBuilder chain (createQueryBuilder added to videos mock).

### SI-04.12 — Endpoint GET /channels/:nickname
- **Status:** completed
- **Tests:** unit+integration passing + 3 e2e
- **Observations:**
ChannelsController (GET /channels/:nickname, @Public) registered in ChannelsModule; Video added to forFeature.
Test setup uses fixed 11-char public ids per seed run.

### SI-04.13 — Endpoint GET /channels/:nickname/videos
- **Status:** completed
- **Tests:** 218 passing (videos, channels, common) + 5 e2e
- **Observations:**
listChannelVideos resolves the channel via the existing channels Repository (findOneBy nickname) instead of ChannelsService.findByNickname, avoiding a new constructor dependency.
Keyset compares date_trunc('milliseconds', published_at) with the ms-precision cursor to avoid repeats on rows with microsecond timestamps (migration backfill).
cursor is base64url JSON {p: ISO date, i: internal uuid}.

## Completion report

- 13/13 SIs implemented (categories, publication state and access rule, PATCH/publish/thumbnail on videos, /me/channel, /me/videos, /channels/:nickname and its cursor-paginated videos).
- Verification: `tsc --noEmit`, `nest build`, `eslint` and `openapi:export` clean; `npm test`: 47 suites / 403 tests passing; `openapi.json` regenerated.
- Environment: run jest inside the `nestjs-api` container (`docker exec`); never `npm ci` from the Windows host.
- Known caveats: categories service integration test relies on the migration seed; `auth.service.integration-spec` can exceed the 5s hook timeout on a cold ts-jest cache.
