---
kind: phase
name: phase-03-videos
test_specs_aware: true
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-08T08:34:50-03:00"
  docs/phases/phase-03-videos/library-refs.md: "2026-10-08T08:34:50-03:00"
  docs/project-plan.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-08T07:48:15-03:00"
  docs/decisions/technical-decisions-phase-01-configuracao-base.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-phase-02-auth.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-05T06:41:42-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-05T06:41:42-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-05T06:41:42-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-05T06:41:42-03:00"
---

# Phase 03 — Upload e Processamento de Vídeos

## Objective

Deliver, in `nestjs-project/`, the backend for large video uploads (up to 10GB via multipart upload direct to object storage), background processing (BullMQ worker extracting duration/metadata with ffprobe and generating a thumbnail), a unique short public URL id per video, and signed-URL streaming and download — with the draft pre-registration of each video at upload start and the `rascunho → processando → pronto|erro` lifecycle. The video UI in `next-frontend/` is out of scope.

---

## Step Implementations

### SI-03.1 — Infra: dependências, configuração e Docker Compose

**Description:** Instala as dependências de fila e storage, cria os namespaces de configuração (`storage`, `queue`, `video`) e adiciona MinIO, Redis e o serviço `video-worker` (imagem com ffmpeg) ao Docker Compose.

**Technical actions:**

1. Instalar em `nestjs-project`: `bullmq`, `@nestjs/bullmq`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-02`, `phase-03-videos/TD-07`)
2. Criar `src/config/storage.config.ts` (`registerAs('storage', ...)`: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_FORCE_PATH_STYLE`, `STORAGE_PRESIGN_EXPIRES_SECONDS`) e `src/config/queue.config.ts` (`registerAs('queue', ...)`: `REDIS_HOST` default `redis`, `REDIS_PORT` default `6379`, `VIDEO_PROCESSING_ATTEMPTS` default `3`, `VIDEO_PROCESSING_BACKOFF_MS` default `5000`, `VIDEO_WORKER_CONCURRENCY`) (per `phase-03-videos/TD-05`, `phase-03-videos/TD-01`, `phase-03-videos/TD-08`)
3. Criar `src/config/video.config.ts` (`registerAs('video', ...)`: `VIDEO_MAX_SIZE_BYTES` default `10737418240`, `VIDEO_PART_SIZE_BYTES` default `16777216`, `VIDEO_UPLOAD_ABANDON_DAYS`), estender `src/config/env.validation.ts` (Joi: `STORAGE_ACCESS_KEY` e `STORAGE_SECRET_KEY` obrigatórios, demais com default) e atualizar `.env.example` (per `phase-01-configuracao-base/TD-01`, `phase-01-configuracao-base/TD-02`, `phase-01-configuracao-base/TD-03`)
4. Adicionar a `nestjs-project/compose.yaml` os serviços `minio` (API `9000`, console `9001`, CORS liberando `PUT`/`GET`/`HEAD` e expondo `ETag`/`Range` via env do MinIO), um job de init que cria o bucket e `redis`; `nestjs-api` passa a depender de ambos (per `phase-03-videos/TD-01`, `phase-03-videos/TD-05`)
5. Instalar `ffmpeg` (inclui `ffprobe`) em `Dockerfile.dev` e adicionar o serviço `video-worker` ao Compose — mesma imagem, comando `npm run start:worker:dev`, sem porta HTTP, dependente de `db`, `redis` e `minio` (per `phase-03-videos/TD-03`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `env.validation` (novas variáveis) | Integration: variáveis obrigatórias ausentes falham no bootstrap, defaults aplicados | `src/config/env.validation.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose up -d` deixa `minio` e `redis` com status `running`, e `docker compose exec redis redis-cli ping` retorna `PONG`
- `curl -I http://localhost:9000/minio/health/live` retorna `200`
- Iniciar a aplicação sem `STORAGE_ACCESS_KEY` falha no bootstrap com erro de validação Joi — a aplicação não sobe
- `docker compose exec nestjs-api ffprobe -version` termina com exit code `0` e imprime a versão
- `GET /` continua retornando `200` com as novas variáveis de ambiente definidas

---

### SI-03.2 — Criar entidade Video, enum de status e gerador de public_id

**Description:** Cria a entidade `Video` com o ciclo de status do TD-08, o gerador de `public_id` base62 do TD-06 e a migration correspondente.

**Technical actions:**

1. Criar `src/videos/entities/video.entity.ts` — entidade `Video` com as colunas, enum `VideoStatus` (`rascunho`, `processando`, `pronto`, `erro`) e índices de `### Data Model → Video` (per `phase-03-videos/TD-05`, `phase-03-videos/TD-08`)
2. Adicionar o lado inverso `videos` (`OneToMany`) em `src/channels/entities/channel.entity.ts`, apontando para `Video.channel`
3. Criar `src/videos/public-id.util.ts` — `generatePublicId()` retorna 11 caracteres base62 via `node:crypto` com amostragem por rejeição (sem viés de módulo) (per `phase-03-videos/TD-06`)
4. Criar a migration `src/database/migrations/<timestamp>-CreateVideos.ts` — tipo enum, tabela `videos`, FK para `channels`, índices `public_id` (unique), `channel_id` e `status`; `down` remove tabela e enum (convenção herdada: schema só muda via migrations TypeORM versionadas)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` | Integration: unique de `public_id`, default `status = 'rascunho'`, enum, FK | `src/videos/entities/video.entity.integration-spec.ts` |
| `generatePublicId` | Unit: tamanho, alfabeto, variabilidade | `src/videos/public-id.util.spec.ts` |
| Migration `CreateVideos` | Integration: `up`/`down` | `src/database/migrations.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Inserir dois `videos` com o mesmo `public_id` — a segunda inserção viola a constraint unique
- Inserir um `video` sem `status` — persiste com `status = 'rascunho'`
- Inserir um `video` com `status = 'publicado'` — rejeitado pelo enum do PostgreSQL
- Inserir um `video` com `channel_id` inexistente — viola a FK
- Executar a migration `up` cria a tabela `videos` e `down` a remove junto com o tipo enum
- `generatePublicId()` retorna 11 caracteres, todos em `[0-9A-Za-z]`

---

### SI-03.3 — Criar StorageModule (cliente S3, multipart, URLs assinadas e bucket)

**Description:** Encapsula o object storage (MinIO/S3) num módulo com operações de multipart upload, URLs assinadas e preparo idempotente do bucket, reutilizado pela API e pelo worker.

**Technical actions:**

1. Criar `src/storage/storage.module.ts` — provider de `S3Client` configurado por `ConfigType<typeof storageConfig>` (endpoint, região, credenciais, `forcePathStyle`); exporta `StorageService` (per `phase-03-videos/TD-02`, `phase-01-configuracao-base/TD-03`)
2. Criar `src/storage/storage.service.ts` — operações de multipart: `createMultipartUpload(key, contentType)`, `presignUploadPart(key, uploadId, partNumber)`, `listParts(key, uploadId)` (paginado), `completeMultipartUpload(key, uploadId, parts)` e `abortMultipartUpload(key, uploadId)` (per `phase-03-videos/TD-02`)
3. Em `StorageService`, adicionar `presignGetObject(key, { expiresIn, downloadFileName? })` (usa `ResponseContentDisposition: attachment; filename="..."` quando informado) e `putObject(key, body, contentType)` (per `phase-03-videos/TD-07`, `phase-03-videos/TD-04`)
4. Criar `src/storage/storage-bootstrap.service.ts` (`OnApplicationBootstrap`) — garante o bucket de `storageConfig` e aplica regra de lifecycle `AbortIncompleteMultipartUpload` após `VIDEO_UPLOAD_ABANDON_DAYS`, de forma idempotente; se o MinIO local rejeitar a regra, registrar aviso e manter a regra apenas em S3 (per `phase-03-videos/TD-02`, `phase-03-videos/TD-05`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `StorageService` | Integration: ciclo multipart e URLs assinadas contra o MinIO real | `src/storage/storage.service.integration-spec.ts` |
| `StorageBootstrapService` | Integration: bucket criado e lifecycle idempotentes | `src/storage/storage-bootstrap.service.integration-spec.ts` |
| `StorageModule` | Unit: compilação do módulo com imports configurados | `src/storage/storage.module.spec.ts` |

**Dependencies:** SI-03.1

**Acceptance criteria:**

- No bootstrap com o MinIO ativo o bucket configurado passa a existir, e um segundo bootstrap não falha
- `PUT` de bytes na URL assinada de uma parte retorna `200` com header `ETag`
- `listParts` após o `PUT` de duas partes retorna as duas com `partNumber` e `size` corretos
- `completeMultipartUpload` gera um objeto cujo tamanho é a soma das partes
- `GET` na URL assinada com header `Range: bytes=0-99` retorna `206` com 100 bytes
- A URL assinada com `downloadFileName` responde com `Content-Disposition: attachment; filename="<nome>"`
- Após `abortMultipartUpload`, `listParts` do mesmo `uploadId` falha com `NoSuchUpload`

---

### SI-03.4 — Endpoint POST /videos

**Description:** Pré-cadastra o vídeo como rascunho e abre o multipart upload no storage ao iniciar o upload, validando tamanho e tipo declarados.

**Route:** POST /videos
**Test Specs:** see `nestjs-project/specs/videos-create.plan.md`
**Authorization:** Authenticated (dono do canal do token)

**Technical actions:**

1. Criar `src/videos/dto/create-video.dto.ts` — `CreateVideoDto` conforme `#### Validation Rules — Videos` (`fileName`, `fileSize`, `contentType`, `title?`) (per `phase-02-auth/TD-06`)
2. Adicionar a `src/common/exceptions/domain.exception.ts` as exceções de vídeo do `### Error Catalog` (`VideoNotFoundException`, `FileTooLargeException`, `UnsupportedMediaTypeException`, `UploadSizeMismatchException`, `InvalidPartNumberException`, `InvalidPartListException`, `InvalidUploadStateException`, `VideoNotReadyException`) com os `errorCode`/HTTP exatos (per `phase-02-auth/TD-07`)
3. Criar `src/videos/videos.module.ts` (`TypeOrmModule.forFeature([Video])`, `StorageModule`, `ChannelsModule`) registrado no `AppModule`, e `VideosService.createDraft(userId, dto)`: valida `fileSize`/`contentType` contra `videoConfig`, gera `public_id` com retry em colisão da unique (per `phase-03-videos/TD-06`), define `id` (uuid) e `storage_key = videos/{id}/original.{ext}` (per `phase-03-videos/TD-05`), persiste o rascunho com `title` padrão = `fileName` sem extensão, abre o multipart via `StorageService` e grava `upload_id`; se o storage falhar, remove o rascunho (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`, `phase-03-videos/TD-09`)
4. Criar `src/videos/videos.controller.ts` — `POST /videos` (201) com `@CurrentUser()`, retornando `id`, `title`, `status`, `partSize` e `totalParts` (`ceil(fileSize / partSize)`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.createDraft` | Unit: limite de tamanho, tipo não permitido, título padrão, retry de colisão de `public_id` (mock repo e storage) | `src/videos/videos.service.spec.ts` |
| `VideosService.createDraft` | Integration: rascunho persistido e multipart aberto no MinIO | `src/videos/videos.service.integration-spec.ts` |
| `VideosModule` | Unit: compilação do módulo com imports configurados | `src/videos/videos.module.spec.ts` |

**Dependencies:** SI-03.2, SI-03.3

**Acceptance criteria:**

- `POST /videos` com token válido e `{ "fileName": "aula.mp4", "fileSize": 1073741824, "contentType": "video/mp4" }` retorna `201` com `id` de 11 caracteres, `status: "rascunho"`, `title: "aula"`, `partSize: 16777216` e `totalParts: 64`
- `POST /videos` com `title` informado retorna `201` preservando o `title` enviado
- `POST /videos` com `fileSize: 10737418241` retorna `400` com `error: "FILE_TOO_LARGE"`
- `POST /videos` com `contentType: "application/pdf"` retorna `400` com `error: "UNSUPPORTED_MEDIA_TYPE"`
- `POST /videos` sem `fileName` retorna `400` com `error: "VALIDATION_ERROR"`
- `POST /videos` sem header `Authorization` retorna `401`
- Após o `201`, a linha em `videos` existe com `upload_id` preenchido e `storage_key = videos/{id}/original.mp4`, e há um multipart upload aberto no storage para essa chave

---

### SI-03.5 — Endpoint POST /videos/:publicId/upload/part-urls

**Description:** Emite URLs assinadas de `UploadPart` para as partes pedidas, permitindo o envio direto ao storage.

**Route:** POST /videos/:publicId/upload/part-urls
**Test Specs:** see `nestjs-project/specs/videos-part-urls.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Criar `src/videos/dto/part-urls.dto.ts` — `PartUrlsDto` (`partNumbers`: 1–100 inteiros ≥ 1) (per `phase-02-auth/TD-06`)
2. Em `VideosService`, criar `findOwnedVideo(userId, publicId)` — resolve o canal do usuário e lança `VideoNotFoundException` quando o vídeo não existe ou pertence a outro canal; reutilizado pelos endpoints de upload
3. Em `VideosService`, criar `getPartUrls(userId, publicId, partNumbers)` — exige `status = 'rascunho'` e `upload_id` aberto (`InvalidUploadStateException`), valida cada número em `1..totalParts` (`InvalidPartNumberException`) e assina via `StorageService.presignUploadPart` com TTL de `storageConfig` (per `phase-03-videos/TD-02`)
4. Em `VideosController`, adicionar `POST /videos/:publicId/upload/part-urls` (200) retornando `urls` e `expiresIn`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.getPartUrls` | Unit: não encontrado/não dono, estado inválido, número de parte fora do intervalo | `src/videos/videos.service.spec.ts` |
| `VideosService.getPartUrls` | Integration: URL emitida aceita o `PUT` da parte no MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.4

**Acceptance criteria:**

- `POST /videos/:publicId/upload/part-urls` pelo dono com `{ "partNumbers": [1, 2] }` retorna `200` com duas URLs em `urls` e `expiresIn`
- `PUT` de bytes numa URL retornada responde `200` com `ETag`
- `partNumbers` contendo `0` ou um valor maior que `totalParts` retorna `400` com `error: "INVALID_PART_NUMBER"`
- Token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- Vídeo que não está em `rascunho` retorna `409` com `error: "INVALID_UPLOAD_STATE"`
- Mais de 100 itens em `partNumbers` retorna `400` com `error: "VALIDATION_ERROR"`
- Sem header `Authorization` retorna `401`

---

### SI-03.6 — Endpoint GET /videos/:publicId/upload/parts

**Description:** Lista as partes já enviadas ao storage para que o cliente retome um upload interrompido.

**Route:** GET /videos/:publicId/upload/parts
**Test Specs:** see `nestjs-project/specs/videos-list-parts.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Em `VideosService`, criar `listUploadedParts(userId, publicId)` — usa `findOwnedVideo`, exige `rascunho` com `upload_id` aberto e mapeia `StorageService.listParts` para `{ partNumber, size, eTag }` (per `phase-03-videos/TD-02`)
2. Em `VideosController`, adicionar `GET /videos/:publicId/upload/parts` (200) retornando `parts`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.listUploadedParts` | Unit: não dono, estado inválido, mapeamento das partes | `src/videos/videos.service.spec.ts` |
| `VideosService.listUploadedParts` | Integration: partes enviadas ao MinIO aparecem na listagem | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.5

**Acceptance criteria:**

- `GET /videos/:publicId/upload/parts` pelo dono logo após `POST /videos` retorna `200` com `parts: []`
- Após enviar as partes 1 e 2 às URLs assinadas, retorna `200` com duas entradas contendo `partNumber`, `size` e `eTag`
- Token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- Vídeo que não está em `rascunho` retorna `409` com `error: "INVALID_UPLOAD_STATE"`
- Sem header `Authorization` retorna `401`

---

### SI-03.7 — Endpoint POST /videos/:publicId/upload/complete

**Description:** Finaliza o multipart upload, valida o tamanho real (TD-09), move o vídeo para `processando` e enfileira o processamento.

**Route:** POST /videos/:publicId/upload/complete
**Test Specs:** see `nestjs-project/specs/videos-complete.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Criar `src/queue/video-queue.module.ts` — `BullModule.forRoot` (conexão de `queueConfig`) e `BullModule.registerQueue({ name: 'video-processing' })`, exportando a fila; registrar no `AppModule` (per `phase-03-videos/TD-01`)
2. Criar `src/videos/dto/complete-upload.dto.ts` — `CompleteUploadDto` (`parts`: array não vazio de `{ partNumber, eTag }`) (per `phase-02-auth/TD-06`)
3. Em `VideosService`, criar `completeUpload(userId, publicId, dto)` — exige `rascunho` com `upload_id`; confronta as partes enviadas com `StorageService.listParts` (`InvalidPartListException`); soma os `Size`: acima de `VIDEO_MAX_SIZE_BYTES` aborta o multipart e lança `FileTooLargeException`, diferente de `declared_size` aborta e lança `UploadSizeMismatchException` (em ambos `upload_id` vira `null`); senão chama `completeMultipartUpload` e atualiza `size_bytes`, `status = 'processando'`, `upload_id = null` (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`, `phase-03-videos/TD-09`)
4. Em `VideosService`, após a atualização, enfileirar o job `video.process` com `{ videoId }` usando `attempts` e `backoff` exponencial de `queueConfig`; se o enqueue falhar, marcar o vídeo como `erro` com `error_reason = 'PROCESSING_FAILED'` e propagar o erro (per `phase-03-videos/TD-01`, `phase-03-videos/TD-08`)
5. Em `VideosController`, adicionar `POST /videos/:publicId/upload/complete` (202) retornando `id` e `status`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.completeUpload` | Unit: ramos de estado, divergência de partes, limite, tamanho divergente, falha de enqueue (mock storage e fila) | `src/videos/videos.service.spec.ts` |
| `VideosService.completeUpload` | Integration: MinIO e Redis reais — objeto consolidado, status atualizado e job enfileirado | `src/videos/videos.service.integration-spec.ts` |
| `VideoQueueModule` | Unit: compilação do módulo com imports configurados | `src/queue/video-queue.module.spec.ts` |

**Dependencies:** SI-03.6

**Acceptance criteria:**

- `POST /videos/:publicId/upload/complete` pelo dono, com as partes enviadas e soma igual ao `fileSize` declarado, retorna `202` com `status: "processando"`
- Após o `202`, a linha do vídeo tem `size_bytes` igual à soma das partes, `status = 'processando'` e `upload_id` nulo
- Após o `202`, a fila `video-processing` contém um job `video.process` com `{ videoId }` e `attempts` igual a `VIDEO_PROCESSING_ATTEMPTS`
- Soma das partes diferente do `fileSize` declarado retorna `400` com `error: "UPLOAD_SIZE_MISMATCH"` e o multipart deixa de existir no storage
- Soma das partes acima de `VIDEO_MAX_SIZE_BYTES` (configurado baixo no teste) retorna `400` com `error: "FILE_TOO_LARGE"` e o multipart é abortado
- `eTag` divergente do armazenado retorna `400` com `error: "INVALID_PART_LIST"`
- Token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- Vídeo já em `processando` retorna `409` com `error: "INVALID_UPLOAD_STATE"`

---

### SI-03.8 — Endpoint DELETE /videos/:publicId/upload

**Description:** Permite ao dono cancelar o upload em andamento, abortando o multipart e descartando o rascunho.

**Route:** DELETE /videos/:publicId/upload
**Test Specs:** see `nestjs-project/specs/videos-cancel-upload.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Em `VideosService`, criar `cancelUpload(userId, publicId)` — usa `findOwnedVideo`, exige `status = 'rascunho'` (`InvalidUploadStateException`), aborta o multipart quando há `upload_id` e remove a linha do vídeo (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`)
2. Em `VideosController`, adicionar `DELETE /videos/:publicId/upload` (204)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.cancelUpload` | Unit: não dono, estado inválido, rascunho sem `upload_id` | `src/videos/videos.service.spec.ts` |
| `VideosService.cancelUpload` | Integration: multipart abortado no MinIO e linha removida | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.5

**Acceptance criteria:**

- `DELETE /videos/:publicId/upload` pelo dono de um rascunho retorna `204`
- Após o `204`, a linha do vídeo deixa de existir em `videos` e o multipart upload deixa de existir no storage
- Token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- Vídeo em `processando` retorna `409` com `error: "INVALID_UPLOAD_STATE"`
- Sem header `Authorization` retorna `401`

---

### SI-03.9 — Worker: entrypoint dedicado e extração de metadados com ffprobe

**Description:** Cria o entrypoint do worker (application context NestJS sem HTTP) e o serviço que extrai duração e metadados do arquivo via `ffprobe`.

**Technical actions:**

1. Criar `src/worker.ts` — `NestFactory.createApplicationContext(WorkerModule)` com `enableShutdownHooks()`, sem listener HTTP (per `phase-03-videos/TD-03`)
2. Criar `src/worker.module.ts` — importa `ConfigModule`, `TypeOrmModule`, `StorageModule`, `VideoQueueModule` e `TypeOrmModule.forFeature([Video])`, reaproveitando as configs da fase 01 (per `phase-01-configuracao-base/TD-03`)
3. Adicionar ao `package.json` os scripts `start:worker`, `start:worker:dev` e `start:worker:prod` apontando para `src/worker.ts`/`dist/worker.js`
4. Criar `src/worker/video-probe.service.ts` — `probe(sourceUrl)` executa `ffprobe -v error -print_format json -show_format -show_streams` via `child_process.execFile` (com timeout), e devolve `{ durationSeconds, hasVideoStream, metadata }` (contêiner, codecs, largura, altura, bitrate); falha de execução ou saída inválida lança erro (per `phase-03-videos/TD-03`, `phase-03-videos/TD-09`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoProbeService` | Unit: parse da saída JSON do ffprobe, ausência de stream de vídeo, falha de execução (mock `execFile`) | `src/worker/video-probe.service.spec.ts` |
| `VideoProbeService` | Integration: `ffprobe` real sobre fixture gerada com ffmpeg | `src/worker/video-probe.service.integration-spec.ts` |
| `WorkerModule` | Unit: compilação do módulo com imports configurados | `src/worker.module.spec.ts` |

**Dependencies:** SI-03.1, SI-03.2, SI-03.3, SI-03.7

**Acceptance criteria:**

- `docker compose up -d video-worker` mantém o container em execução, sem porta HTTP publicada, e `docker compose logs video-worker` registra a inicialização do contexto
- `probe` de um MP4 válido retorna `durationSeconds` maior que zero e `hasVideoStream: true`
- `probe` de um arquivo só com áudio retorna `hasVideoStream: false`
- `probe` de um arquivo que não é mídia rejeita com erro

---

### SI-03.10 — Gerar thumbnail a partir de um frame do vídeo

**Description:** Extrai um frame em 10% da duração (mínimo 1s) com ffmpeg e grava a thumbnail no storage.

**Technical actions:**

1. Criar `src/worker/thumbnail-offset.util.ts` — `computeThumbnailOffset(durationSeconds)` retorna `max(1, duração × 0,10)`, limitado à duração quando o vídeo tem menos de 1s (per `phase-03-videos/TD-04`)
2. Criar `src/worker/thumbnail.service.ts` — `generate({ sourceUrl, durationSeconds, destinationKey })` executa `ffmpeg -ss <offset> -i <url> -frames:v 1` com saída JPEG em memória (`execFile` com timeout) e grava via `StorageService.putObject` com `image/jpeg` (per `phase-03-videos/TD-04`, `phase-03-videos/TD-05`)
3. Registrar `ThumbnailService` e `VideoProbeService` como providers do `WorkerModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `computeThumbnailOffset` | Unit: 10% da duração, mínimo de 1s, vídeo mais curto que 1s | `src/worker/thumbnail-offset.util.spec.ts` |
| `ThumbnailService` | Integration: `ffmpeg` real sobre fixture e MinIO real | `src/worker/thumbnail.service.integration-spec.ts` |

**Dependencies:** SI-03.9

**Acceptance criteria:**

- `generate` sobre uma fixture MP4 cria o objeto `videos/{id}/thumbnail.jpg` no storage com `Content-Type: image/jpeg`
- Os primeiros bytes do objeto gerado são `FF D8` (JPEG válido)
- `generate` sobre uma fixture com menos de 1s de duração também cria a thumbnail
- Executar `generate` duas vezes para a mesma chave não falha e mantém um único objeto

---

### SI-03.11 — Processador de vídeos: metadados, thumbnail, status e falha

**Description:** Consome o job `video.process`, extrai metadados, valida a mídia, gera a thumbnail e conduz o vídeo a `pronto` ou `erro` com os retries do BullMQ.

**Technical actions:**

1. Criar `src/worker/video-processing.processor.ts` — `@Processor('video-processing')` estendendo `WorkerHost`; `process(job)` carrega o vídeo e ignora quando não está em `processando`, assina a URL de leitura do original, chama `VideoProbeService.probe`, lança `UnrecoverableError('INVALID_MEDIA')` quando não há stream de vídeo, gera a thumbnail e grava `duration_seconds`, `metadata`, `thumbnail_key` e `status = 'pronto'` (per `phase-03-videos/TD-03`, `phase-03-videos/TD-04`, `phase-03-videos/TD-09`, `phase-03-videos/TD-08`)
2. No mesmo processador, tratar o evento `failed` (`@OnWorkerEvent('failed')`) — a cada falha grava `processing_attempts`; ao esgotar `attempts` ou em `UnrecoverableError`, define `status = 'erro'` e `error_reason` (`INVALID_MEDIA` ou `PROCESSING_FAILED`); enquanto restam tentativas o status permanece `processando` (per `phase-03-videos/TD-08`)
3. Registrar o processador no `WorkerModule` com concorrência de `VIDEO_WORKER_CONCURRENCY` e política `removeOnComplete`/`removeOnFail` (per `phase-03-videos/TD-01`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideoProcessingProcessor` | Unit: ramos de `process` e do handler `failed` (mock probe, thumbnail e repositório) | `src/worker/video-processing.processor.spec.ts` |
| `VideoProcessingProcessor` | Integration: PostgreSQL, MinIO e Redis reais — sucesso, mídia inválida e falha esgotando tentativas | `src/worker/video-processing.processor.integration-spec.ts` |

**Dependencies:** SI-03.7, SI-03.9, SI-03.10

**Acceptance criteria:**

- Após `POST /videos/:publicId/upload/complete` com um MP4 válido, o vídeo passa a `status = 'pronto'` com `duration_seconds` próximo da duração real e `thumbnail_key = videos/{id}/thumbnail.jpg`, e o objeto da thumbnail existe no storage
- Um arquivo sem stream de vídeo leva o vídeo a `status = 'erro'` com `error_reason = 'INVALID_MEDIA'` na primeira tentativa, sem retries
- Falha persistente de storage leva o vídeo a `status = 'erro'` com `error_reason = 'PROCESSING_FAILED'` e `processing_attempts` igual a `VIDEO_PROCESSING_ATTEMPTS`
- Enquanto restam tentativas, o vídeo permanece em `status = 'processando'`
- Reprocessar o job de um vídeo já `pronto` não altera o vídeo

---

### SI-03.12 — Endpoint GET /videos/:publicId

**Description:** Retorna os dados do vídeo; vídeos `pronto` são públicos e os demais status são visíveis apenas ao dono do canal.

**Route:** GET /videos/:publicId
**Test Specs:** see `nestjs-project/specs/videos-get.plan.md`
**Authorization:** Public com token opcional (`pronto` público; demais status somente o dono)

**Technical actions:**

1. Criar `src/auth/decorators/optional-auth.decorator.ts` e `src/auth/guards/optional-jwt.guard.ts` — em rotas `@Public()` com `@OptionalAuth()`, valida o bearer quando presente e popula o usuário; token ausente ou inválido segue como anônimo, sem rejeitar (per `phase-02-auth/TD-02`)
2. Em `VideosService`, criar `getVideo(publicId, userId?)` — aplica a regra de visibilidade (`pronto` para todos; demais somente o dono, senão `VideoNotFoundException`) e monta a resposta com `thumbnailUrl` assinada quando há `thumbnail_key` e `errorReason` apenas para o dono em `erro`
3. Criar `src/videos/dto/video-response.dto.ts` — `VideoResponseDto` conforme `#### GET /videos/:publicId` (per `openapi-docs-nestjs/TD-01`)
4. Em `VideosController`, adicionar `GET /videos/:publicId` (200) com `@Public()` e `@OptionalAuth()`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `OptionalJwtGuard` | Unit: token válido popula o usuário; ausente ou inválido não rejeita | `src/auth/guards/optional-jwt.guard.spec.ts` |
| `VideosService.getVideo` | Unit: matriz de visibilidade por status e papel, `errorReason` e `thumbnailUrl` | `src/videos/videos.service.spec.ts` |
| `VideosService.getVideo` | Integration: dados persistidos e URL de thumbnail assinada contra o MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.4

**Acceptance criteria:**

- `GET /videos/:publicId` anônimo de um vídeo `pronto` retorna `200` com `status: "pronto"`, `durationSeconds` e `thumbnailUrl`
- `GET /videos/:publicId` anônimo de um vídeo em `processando` retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:publicId` pelo dono de um vídeo em `processando` retorna `200` com `status: "processando"`
- `GET /videos/:publicId` pelo dono de um vídeo em `erro` retorna `200` com `errorReason` preenchido
- `GET /videos/:publicId` de outro usuário autenticado sobre um `rascunho` retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:publicId` com um `publicId` inexistente retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:publicId` de um vídeo `pronto` com bearer inválido retorna `200` (tratado como anônimo)

---

### SI-03.13 — Endpoint GET /videos/:publicId/stream

**Description:** Emite a URL assinada de leitura para reprodução em streaming direto do storage, com suporte a `Range`.

**Route:** GET /videos/:publicId/stream
**Test Specs:** see `nestjs-project/specs/videos-stream.plan.md`
**Authorization:** Public com token opcional (`pronto` público; dono recebe 409 quando não `pronto`)

**Technical actions:**

1. Em `VideosService`, criar `getPlaybackUrl(publicId, userId?, { download })` — reutiliza a regra de visibilidade de `getVideo`, lança `VideoNotReadyException` quando o dono pede um vídeo que não está `pronto` e assina o objeto original via `StorageService.presignGetObject` com TTL de `storageConfig` (per `phase-03-videos/TD-07`)
2. Em `VideosController`, adicionar `GET /videos/:publicId/stream` (200) com `@Public()` e `@OptionalAuth()`, retornando `url` e `expiresIn`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.getPlaybackUrl` | Unit: visibilidade, `VIDEO_NOT_READY` para o dono, TTL | `src/videos/videos.service.spec.ts` |
| `VideosService.getPlaybackUrl` | Integration: URL emitida atende `Range` no MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.12

**Acceptance criteria:**

- `GET /videos/:publicId/stream` anônimo de um vídeo `pronto` retorna `200` com `url` e `expiresIn`
- `GET` na `url` retornada com header `Range: bytes=0-99` responde `206` com 100 bytes
- `GET /videos/:publicId/stream` pelo dono de um vídeo em `processando` retorna `409` com `error: "VIDEO_NOT_READY"`
- `GET /videos/:publicId/stream` anônimo de um vídeo em `processando` retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:publicId/stream` com um `publicId` inexistente retorna `404` com `error: "VIDEO_NOT_FOUND"`

---

### SI-03.14 — Endpoint GET /videos/:publicId/download

**Description:** Emite a URL assinada de leitura com `Content-Disposition: attachment` para o download do vídeo.

**Route:** GET /videos/:publicId/download
**Test Specs:** see `nestjs-project/specs/videos-download.plan.md`
**Authorization:** Public com token opcional (`pronto` público; dono recebe 409 quando não `pronto`)

**Technical actions:**

1. Em `VideosService.getPlaybackUrl`, tratar `download: true` passando `downloadFileName = file_name` (aspas e quebras de linha sanitizadas) para `StorageService.presignGetObject` (per `phase-03-videos/TD-07`)
2. Em `VideosController`, adicionar `GET /videos/:publicId/download` (200) com `@Public()` e `@OptionalAuth()`, retornando `url` e `expiresIn`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.getPlaybackUrl` | Unit: nome do arquivo sanitizado e mesmas regras de acesso do stream | `src/videos/videos.service.spec.ts` |
| `VideosService.getPlaybackUrl` | Integration: URL emitida responde com `Content-Disposition` no MinIO | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-03.13

**Acceptance criteria:**

- `GET /videos/:publicId/download` anônimo de um vídeo `pronto` retorna `200` com `url` e `expiresIn`
- `GET` na `url` retornada responde com header `Content-Disposition: attachment; filename="<file_name>"` e corpo com `size_bytes` bytes
- `GET /videos/:publicId/download` pelo dono de um vídeo em `processando` retorna `409` com `error: "VIDEO_NOT_READY"`
- `GET /videos/:publicId/download` anônimo de um vídeo em `processando` retorna `404` com `error: "VIDEO_NOT_FOUND"`

---

## Technical Specifications

### Data Model

#### Video

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | Internal id; used in storage keys (per `phase-03-videos/TD-05`), never exposed in URLs |
| public_id | varchar(11) | unique, not null | base62, 11 chars, generated with `node:crypto`; retry on unique-constraint collision (per `phase-03-videos/TD-06`) |
| channel_id | uuid | FK → channels.id, not null | Owning channel |
| title | varchar(255) | not null | Defaults to the file name without extension when omitted at upload start; editing is Phase 04 |
| status | enum | not null, default `'rascunho'` | PostgreSQL enum: `'rascunho'`, `'processando'`, `'pronto'`, `'erro'` (per `phase-03-videos/TD-08`) |
| file_name | varchar(255) | not null | Original file name declared at upload start |
| content_type | varchar(100) | not null | Declared MIME type; must be in the allowed video container list (per `phase-03-videos/TD-09`) |
| declared_size | bigint | not null | Size in bytes declared at upload start; ≤ 10 GiB (10737418240) |
| size_bytes | bigint | nullable | Real size from the sum of `ListParts` `Size` at completion |
| upload_id | varchar(255) | nullable | S3/MinIO multipart `UploadId`; cleared after complete/abort |
| storage_key | varchar(255) | not null | `videos/{id}/original.{ext}` (per `phase-03-videos/TD-05`) |
| thumbnail_key | varchar(255) | nullable | `videos/{id}/thumbnail.jpg`; set when the thumbnail is generated |
| duration_seconds | numeric(10,3) | nullable | Extracted by ffprobe (per `phase-03-videos/TD-03`) |
| metadata | jsonb | nullable | ffprobe-derived technical metadata (container, codecs, width, height, bitrate) |
| error_reason | varchar(100) | nullable | Set only when `status = 'erro'` (per `phase-03-videos/TD-08`) |
| processing_attempts | integer | not null, default `0` | Attempts consumed by the worker; recorded on failure (per `phase-03-videos/TD-08`) |
| created_at | timestamp | not null, auto-generated | `@CreateDateColumn` |
| updated_at | timestamp | not null, auto-generated | `@UpdateDateColumn` |

**Relations:** Video → Channel (many-to-one via `channel_id`); Channel has many Video
**Indexes:** `(public_id)` — unique, `(channel_id)` — FK, `(status)` — worker/lifecycle queries

---

### API Contracts

#### POST /videos (SI-03.4)

Starts an upload: creates the video draft (`status = 'rascunho'`) and the multipart upload in object storage (per `phase-03-videos/TD-02`, `phase-03-videos/TD-08`). Declared `fileSize` and `contentType` are validated here (per `phase-03-videos/TD-09`, point 1).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:**
- fileName: string, required — max 255 characters
- fileSize: integer, required — bytes; min 1, max 10737418240 (10 GiB)
- contentType: string, required — must be one of the allowed video container types (`video/mp4`, `video/quicktime`, `video/x-matroska`, `video/webm`, `video/x-msvideo`); the final list is confirmed in SI-03.4
- title: string, optional — max 255 characters; defaults to `fileName` without extension

**Response 201:**
- id: string (the video `public_id`, 11 chars base62)
- title: string
- status: string — `rascunho`
- partSize: integer — bytes per part (16 MiB = 16777216 by default; last part may be smaller)
- totalParts: integer — `ceil(fileSize / partSize)`

**Error responses:**
- 400 FILE_TOO_LARGE: when `fileSize` exceeds 10 GiB
- 400 UNSUPPORTED_MEDIA_TYPE: when `contentType` is outside the allowed video container list
- 400 validation error: when the request body fails schema validation
- 401: when the access token is missing or invalid

---

#### POST /videos/:publicId/upload/part-urls (SI-03.5)

Issues presigned `UploadPart` URLs for the requested part numbers (per `phase-03-videos/TD-02`).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:**
- partNumbers: integer[], required — each between 1 and `totalParts`; min 1, max 100 items per request

**Response 200:**
- urls: array of `{ partNumber: integer, url: string }` — presigned PUT URLs
- expiresIn: integer — seconds until the URLs expire

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist or the caller is not the owner
- 409 INVALID_UPLOAD_STATE: when the video is not in `rascunho` or has no open multipart upload
- 400 INVALID_PART_NUMBER: when a part number is outside `1..totalParts`
- 400 validation error: when the request body fails schema validation
- 401: when the access token is missing or invalid

---

#### GET /videos/:publicId/upload/parts (SI-03.6)

Lists the parts already stored for the open multipart upload, so a client can resume (per `phase-03-videos/TD-02`, `ListParts`).

**Request headers:**
- Authorization: Bearer {accessToken}

**Response 200:**
- parts: array of `{ partNumber: integer, size: integer, eTag: string }`

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist or the caller is not the owner
- 409 INVALID_UPLOAD_STATE: when the video is not in `rascunho` or has no open multipart upload
- 401: when the access token is missing or invalid

---

#### POST /videos/:publicId/upload/complete (SI-03.7)

Finalizes the multipart upload, validates the real size and enqueues processing (per `phase-03-videos/TD-02`, `phase-03-videos/TD-09` point 2, `phase-03-videos/TD-01`).

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:**
- parts: array of `{ partNumber: integer, eTag: string }`, required — min 1 item

**Response 202:**
- id: string (`public_id`)
- status: string — `processando`

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist or the caller is not the owner
- 409 INVALID_UPLOAD_STATE: when the video is not in `rascunho` or has no open multipart upload
- 400 INVALID_PART_LIST: when the submitted parts do not match the parts stored in object storage
- 400 FILE_TOO_LARGE: when the sum of stored part sizes exceeds 10 GiB (the multipart upload is aborted)
- 400 UPLOAD_SIZE_MISMATCH: when the sum of stored part sizes differs from the declared `fileSize` (the multipart upload is aborted)
- 400 validation error: when the request body fails schema validation
- 401: when the access token is missing or invalid

---

#### DELETE /videos/:publicId/upload (SI-03.8)

Aborts the open multipart upload and discards the draft.

**Request headers:**
- Authorization: Bearer {accessToken}

**Response 204:** No content.

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist or the caller is not the owner
- 409 INVALID_UPLOAD_STATE: when the video is not in `rascunho`
- 401: when the access token is missing or invalid

---

#### GET /videos/:publicId (SI-03.12)

Returns the video record. `pronto` videos are public; `rascunho`, `processando` and `erro` are visible only to the channel owner (access rules per AMB-1 resolution in `validation.md`).

**Request headers:**
- Authorization: Bearer {accessToken} — optional (anonymous allowed for `pronto` videos)

**Response 200:**
- id: string (`public_id`)
- title: string
- status: string — `rascunho` | `processando` | `pronto` | `erro`
- durationSeconds: number | null
- thumbnailUrl: string | null — presigned GET URL, present only when `thumbnail_key` is set
- errorReason: string | null — returned only to the owner when `status = 'erro'`
- createdAt: string (ISO 8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist, or is not `pronto` and the caller is not the owner

---

#### GET /videos/:publicId/stream (SI-03.13)

Issues a short-TTL presigned GET URL for the original file; the client streams directly from storage with `Range` support (per `phase-03-videos/TD-07`).

**Request headers:**
- Authorization: Bearer {accessToken} — optional (anonymous allowed for `pronto` videos)

**Response 200:**
- url: string — presigned GET URL
- expiresIn: integer — seconds until the URL expires

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist, or is not `pronto` and the caller is not the owner
- 409 VIDEO_NOT_READY: when the caller is the owner and the video is not `pronto`

---

#### GET /videos/:publicId/download (SI-03.14)

Same as `/stream`, but the presigned URL carries `response-content-disposition: attachment; filename="{file_name}"` (per `phase-03-videos/TD-07`).

**Request headers:**
- Authorization: Bearer {accessToken} — optional (anonymous allowed for `pronto` videos)

**Response 200:**
- url: string — presigned GET URL
- expiresIn: integer — seconds until the URL expires

**Error responses:**
- 404 VIDEO_NOT_FOUND: when the video does not exist, or is not `pronto` and the caller is not the owner
- 409 VIDEO_NOT_READY: when the caller is the owner and the video is not `pronto`

---

#### Validation Rules — Videos

- `fileName`: required, string, max 255 characters
- `fileSize`: required, integer, min 1, max 10737418240
- `contentType`: required, string, one of the allowed video container types
- `title`: optional, string, max 255 characters
- `partNumbers`: required, integer array, 1–100 items, each ≥ 1
- `parts`: required, non-empty array of `{ partNumber ≥ 1, eTag: non-empty string }`

---

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner | Notes |
|----------|-----------|---------------|-------|-------|
| POST /videos | ✗ | ✓ | ✓ | Creates the video in the caller's channel |
| POST /videos/:publicId/upload/part-urls | ✗ | ✗ | ✓ | Owner only; non-owner receives 404 VIDEO_NOT_FOUND |
| GET /videos/:publicId/upload/parts | ✗ | ✗ | ✓ | Owner only |
| POST /videos/:publicId/upload/complete | ✗ | ✗ | ✓ | Owner only |
| DELETE /videos/:publicId/upload | ✗ | ✗ | ✓ | Owner only, `rascunho` only |
| GET /videos/:publicId | ✓ (`pronto`) | ✓ (`pronto`) | ✓ (any status) | `@Public()` route with optional token; non-`pronto` visible only to owner |
| GET /videos/:publicId/stream | ✓ (`pronto`) | ✓ (`pronto`) | ✓ (`pronto`) | `@Public()` route with optional token; owner gets 409 when not `pronto` |
| GET /videos/:publicId/download | ✓ (`pronto`) | ✓ (`pronto`) | ✓ (`pronto`) | `@Public()` route with optional token; owner gets 409 when not `pronto` |

---

### Error Catalog

**Error response format:** inherited from Phase 02 — `{ statusCode: number, error: string, message: string }`; `error` carries the domain code below, and `VALIDATION_ERROR` with an array `message` for validation failures.

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| VIDEO_NOT_FOUND | 404 | Video not found | Any `/videos/:publicId*` request where the video does not exist, or the caller has no access (non-owner on a non-`pronto` video, or on an owner-only upload endpoint) |
| FILE_TOO_LARGE | 400 | File exceeds the 10 GiB limit | `POST /videos` with `fileSize` > 10 GiB; `POST /videos/:publicId/upload/complete` when the summed part sizes exceed 10 GiB |
| UNSUPPORTED_MEDIA_TYPE | 400 | Content type is not an allowed video container | `POST /videos` with `contentType` outside the allowed list |
| UPLOAD_SIZE_MISMATCH | 400 | Uploaded size differs from the declared size | `POST /videos/:publicId/upload/complete` when the summed part sizes ≠ declared `fileSize` |
| INVALID_PART_NUMBER | 400 | Part number out of range | `POST /videos/:publicId/upload/part-urls` with a part number outside `1..totalParts` |
| INVALID_PART_LIST | 400 | Submitted parts do not match the uploaded parts | `POST /videos/:publicId/upload/complete` when the submitted `partNumber`/`eTag` pairs differ from `ListParts` |
| INVALID_UPLOAD_STATE | 409 | Video is not in a state that accepts this upload operation | Upload endpoints on a video not in `rascunho` or without an open multipart upload |
| VIDEO_NOT_READY | 409 | Video is not ready | `GET /videos/:publicId/stream` or `/download` by the owner while `status ≠ 'pronto'` |

**Worker `error_reason` values** (stored on `videos.error_reason` when `status = 'erro'`, per `phase-03-videos/TD-08` and `phase-03-videos/TD-09`; not HTTP errors):

| error_reason | Trigger |
|--------------|---------|
| INVALID_MEDIA | `ffprobe` finds no video stream; marked `erro` immediately, no retry (`UnrecoverableError`) |
| PROCESSING_FAILED | Processing failed on every allowed BullMQ attempt (ffprobe, thumbnail or storage error) |

---

### Events/Messages

#### video.process

**Payload:**

```json
{ "videoId": "uuid" }
```

**Queue:** `video-processing` (BullMQ on Redis, per `phase-03-videos/TD-01`)
**Producer:** `VideosService` — enqueued by `POST /videos/:publicId/upload/complete` after the video moves to `processando` (per `phase-03-videos/TD-01`, `phase-03-videos/TD-08`)
**Consumer:** `VideoProcessingProcessor` in the dedicated worker entrypoint (per `phase-03-videos/TD-03`) — runs ffprobe, validates a video stream exists (per `phase-03-videos/TD-09`), stores `duration_seconds` and `metadata`, generates the thumbnail at 10% of the duration with a 1 s minimum (per `phase-03-videos/TD-04`), then sets `status = 'pronto'`
**Trigger:** upload completion
**Delivery semantics:** at-least-once with job options `attempts: 3` and `backoff: { type: 'exponential', delay: 5000 }` (defaults, overridable via configuration); the status stays `processando` across retries and becomes `erro` only after the attempts are exhausted or an `UnrecoverableError` is thrown, recording `error_reason` and `processing_attempts` (per `phase-03-videos/TD-08`). The processor must be idempotent (re-running overwrites `thumbnail.jpg` and the metadata columns).

---

## Dependency Map

SI-03.1 (root)
├── SI-03.3 — depends on SI-03.1 (config e MinIO devem existir antes do StorageModule)
│   └── SI-03.4 — depends on SI-03.2 + SI-03.3 (endpoint usa entidade e storage)
│       ├── SI-03.5 — depends on SI-03.4 (rascunho deve existir)
│       │   ├── SI-03.6 — depends on SI-03.5 (reutiliza `findOwnedVideo`)
│       │   │   └── SI-03.7 — depends on SI-03.6 (complete confronta `listParts`)
│       │   │       ├── SI-03.9 — depends on SI-03.1 + SI-03.2 + SI-03.3 + SI-03.7 (WorkerModule importa a fila)
│       │   │       │   └── SI-03.10 — depends on SI-03.9 (ThumbnailService usa o WorkerModule)
│       │   │       │       └── SI-03.11 — depends on SI-03.7 + SI-03.9 + SI-03.10 (processador orquestra probe e thumbnail)
│       ├── SI-03.8 — depends on SI-03.5 (reutiliza `findOwnedVideo`)
│       └── SI-03.12 — depends on SI-03.4 (leitura do vídeo e regra de visibilidade)
│           └── SI-03.13 — depends on SI-03.12 (reutiliza visibilidade)
│               └── SI-03.14 — depends on SI-03.13 (reutiliza `getPlaybackUrl`)
SI-03.2 (root, independent)

---

## Deliverables

- [ ] SI-03.1 — Infra: dependências, configuração e Docker Compose
- [ ] SI-03.2 — Criar entidade Video, enum de status e gerador de public_id
- [ ] SI-03.3 — Criar StorageModule (cliente S3, multipart, URLs assinadas e bucket)
- [ ] SI-03.4 — Endpoint POST /videos
- [ ] SI-03.5 — Endpoint POST /videos/:publicId/upload/part-urls
- [ ] SI-03.6 — Endpoint GET /videos/:publicId/upload/parts
- [ ] SI-03.7 — Endpoint POST /videos/:publicId/upload/complete
- [ ] SI-03.8 — Endpoint DELETE /videos/:publicId/upload
- [ ] SI-03.9 — Worker: entrypoint dedicado e extração de metadados com ffprobe
- [ ] SI-03.10 — Gerar thumbnail a partir de um frame do vídeo
- [ ] SI-03.11 — Processador de vídeos: metadados, thumbnail, status e falha
- [ ] SI-03.12 — Endpoint GET /videos/:publicId
- [ ] SI-03.13 — Endpoint GET /videos/:publicId/stream
- [ ] SI-03.14 — Endpoint GET /videos/:publicId/download

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
