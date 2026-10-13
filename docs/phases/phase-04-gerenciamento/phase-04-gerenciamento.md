---
kind: phase
name: phase-04-gerenciamento
test_specs_aware: true
sources_mtime:
  docs/phases/phase-04-gerenciamento/context.md: "2026-10-13T14:15:39-03:00"
  docs/phases/phase-04-gerenciamento/library-refs.md: "2026-10-13T14:15:39-03:00"
  docs/project-plan.md: "2026-10-13T13:55:04-03:00"
  docs/decisions/technical-decisions-phase-04-gerenciamento.md: "2026-10-13T14:13:47-03:00"
  docs/decisions/technical-decisions-openapi-docs-nestjs.md: "2026-10-13T13:55:04-03:00"
  docs/decisions/technical-decisions-next-frontend-openapi-typing.md: "2026-10-13T13:55:04-03:00"
  docs/decisions/technical-decisions-next-frontend-config-base.md: "2026-10-13T13:55:04-03:00"
  docs/decisions/technical-decisions-next-frontend-msw-foundation.md: "2026-10-13T13:55:04-03:00"
  docs/phases/phase-01-configuracao-base/context.md: "2026-10-13T13:55:04-03:00"
  docs/phases/phase-02-auth/context.md: "2026-10-13T13:55:04-03:00"
  docs/phases/phase-02-auth-frontend/context.md: "2026-10-13T13:55:04-03:00"
  docs/phases/phase-03-videos/context.md: "2026-10-13T13:55:04-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-13T13:55:03-03:00"
---

# Phase 04 — Gerenciamento de Vídeos e Canal

## Objective

Entregar, no `nestjs-project/`, o backend de gerenciamento de vídeos e canal: categorias de vídeo, edição das informações do vídeo (título, descrição, categoria e thumbnail customizada), visibilidade pública ou unlisted com o fluxo rascunho → publicação, listagem do painel do dono (com contadores iniciais em zero), edição do canal (nickname, nome e descrição) e página pública do canal com listagem de vídeos. A interface em `next-frontend/` fica fora desta fase.

---

## Step Implementations

### SI-04.1 — Infra: sharp, tipos do Multer, configuração de thumbnail e exceções de domínio

**Description:** Instala `sharp` e os tipos do Multer, adiciona a configuração de limites da thumbnail e cria as exceções de domínio da fase, para que os SIs seguintes só as consumam.

**Technical actions:**

1. Instalar em `nestjs-project`: `sharp` (dependência) e `@types/multer` (devDependency), e confirmar que o binário pré-compilado do `sharp` carrega no container Node 25 (per `phase-04-gerenciamento/TD-03`)
2. Estender `src/config/video.config.ts` com `thumbnailMaxBytes` (`VIDEO_THUMBNAIL_MAX_BYTES`, default `2097152`), `thumbnailMaxWidth` (`VIDEO_THUMBNAIL_MAX_WIDTH`, default `1280`) e `thumbnailMaxHeight` (`VIDEO_THUMBNAIL_MAX_HEIGHT`, default `720`) (per `phase-04-gerenciamento/TD-03`, `phase-01-configuracao-base/TD-03`)
3. Declarar as três variáveis no schema Joi de `src/config/env.validation.ts` (inteiros ≥ 1, com os defaults) e em `.env.example` (per `phase-01-configuracao-base/TD-02`)
4. Adicionar a `src/common/exceptions/domain.exception.ts` as exceções do `### Error Catalog`: `CategoryNotFoundException`, `CategoryRequiredException`, `VideoUploadInProgressException`, `VideoAlreadyPublishedException`, `InvalidThumbnailException`, `ThumbnailTooLargeException`, `NicknameAlreadyExistsException`, `ChannelNotFoundException` e `InvalidCursorException`, com `errorCode`, HTTP e mensagem exatos (per `phase-02-auth/TD-07`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `env.validation` (novas variáveis) | Integration: defaults aplicados e valores inválidos rejeitados | `src/config/env.validation.integration-spec.ts` |
| `DomainExceptionFilter` | Unit: mapeia cada nova exceção para `{ statusCode, error, message }` | `src/common/filters/domain-exception.filter.spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- `docker compose exec nestjs-api node -e "require('sharp')"` termina com exit code `0`
- Iniciar a aplicação com `VIDEO_THUMBNAIL_MAX_BYTES=0` falha no bootstrap com erro de validação Joi — a aplicação não sobe
- Sem as variáveis definidas, a configuração de vídeo usa `2097152`, `1280` e `720`
- `GET /` continua retornando `200`

---

### SI-04.2 — Criar entidade Category e migration com seed

**Description:** Cria a tabela `categories` e a popula com a lista inicial confirmada, na própria migration.

**Technical actions:**

1. Criar `src/categories/entities/category.entity.ts` — entidade `Category` conforme `### Data Model → Category`, com constraint e índice nomeados explicitamente como nas migrations da Fase 03 (per `phase-04-gerenciamento/TD-02`)
2. Criar a migration `src/database/migrations/<timestamp>-CreateCategories.ts` — tabela, unique em `slug` e `INSERT` das 8 categorias (Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros) com `sort_order` 1–8; `down` remove a tabela (per `phase-04-gerenciamento/TD-02`, convenção herdada de migrations versionadas)
3. Registrar a nova migration e `Category` em `src/database/migrations.integration-spec.ts`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Category` | Integration: unique de `slug` | `src/categories/entities/category.entity.integration-spec.ts` |
| Migration `CreateCategories` | Integration: `up` com seed, `down` | `src/database/migrations.integration-spec.ts` |

**Dependencies:** none

**Acceptance criteria:**

- Executar a migration `up` cria a tabela `categories` com 8 linhas, e `SELECT slug FROM categories ORDER BY sort_order` retorna `educacao, entretenimento, esportes, jogos, musica, noticias, tecnologia, outros`
- Os `name` semeados são `Educação`, `Entretenimento`, `Esportes`, `Jogos`, `Música`, `Notícias`, `Tecnologia` e `Outros`
- Inserir uma categoria com `slug` repetido — viola a constraint unique
- Executar a migration `down` remove a tabela `categories`

---

### SI-04.3 — Colunas de edição, publicação e contadores em Video

**Description:** Estende a entidade `Video` com descrição, categoria, visibilidade, instante de publicação e contadores, preservando a visibilidade dos vídeos já prontos.

**Technical actions:**

1. Criar `src/videos/video-visibility.enum.ts` — `VideoVisibility` (`public`, `unlisted`) (per `phase-04-gerenciamento/TD-01`)
2. Estender `src/videos/entities/video.entity.ts` com `description`, `category_id` (+ `ManyToOne` para `Category`), `visibility`, `published_at` e os quatro contadores, e o lado inverso `videos` em `Category`; declarar os índices `(category_id)` e `(channel_id, published_at, id)` (per `phase-04-gerenciamento/TD-01`, `phase-04-gerenciamento/TD-05`)
3. Criar a migration `<timestamp>-AddVideoManagementColumns.ts` — enum `videos_visibility_enum`, colunas, FK `ON DELETE RESTRICT`, índices e backfill `published_at = updated_at` para linhas com `status = 'pronto'` (per `phase-04-gerenciamento/TD-01`)
4. Adicionar `Category` ao `ALL_ENTITIES` de todos os specs que registram entidades e à lista de `migrations.integration-spec.ts` (mesma mudança feita na Fase 03 para `Video`)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `Video` (novas colunas) | Integration: defaults, enum, FK de categoria | `src/videos/entities/video.entity.integration-spec.ts` |
| Migration `AddVideoManagementColumns` | Integration: `up` com backfill, `down` | `src/database/migrations.integration-spec.ts` |

**Dependencies:** SI-04.2

**Acceptance criteria:**

- Inserir um `video` sem `visibility` — persiste com `visibility = 'public'`, `published_at` nulo e os quatro contadores iguais a `0`
- Inserir um `video` com `visibility = 'private'` — rejeitado pelo enum do PostgreSQL
- Inserir um `video` com `category_id` inexistente — viola a FK
- Executar a migration `up` sobre um vídeo existente com `status = 'pronto'` define `published_at` igual ao `updated_at` e `visibility = 'public'`
- Executar a migration `up` sobre um vídeo em `rascunho`, `processando` ou `erro` mantém `published_at` nulo
- Executar a migration `down` remove as colunas e o tipo `videos_visibility_enum`

---

### SI-04.4 — Endpoint GET /categories

**Description:** Expõe a lista pública de categorias para a interface preencher a escolha de categoria.

**Route:** GET /categories
**Test Specs:** see `nestjs-project/specs/categories-list.plan.md`
**Authorization:** Public

**Technical actions:**

1. Criar `src/categories/dto/categories-response.dto.ts` — `CategoryDto` (`id`, `slug`, `name`) e `CategoriesResponseDto` (`items`) (per `openapi-docs-nestjs/TD-01`)
2. Criar `src/categories/categories.service.ts` — `findAll()` ordenado por `sort_order`
3. Criar `src/categories/categories.controller.ts` — `GET /categories` com `@Public()`
4. Criar `src/categories/categories.module.ts` (exporta `CategoriesService`) e registrá-lo no `AppModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `CategoriesService` | Integration: leitura ordenada contra o banco com o seed da migration | `src/categories/categories.service.integration-spec.ts` |
| `CategoriesModule` | Unit: compilação do módulo com imports configurados | `src/categories/categories.module.spec.ts` |

**Dependencies:** SI-04.2

**Acceptance criteria:**

- `GET /categories` sem header `Authorization` retorna `200` com `items` de 8 categorias
- Os `items` seguem a ordem `Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros`
- Cada item contém `id` (uuid), `slug` e `name`

---

### SI-04.5 — Regra de acesso por publicação e publicationState

**Description:** Troca o critério "pronto = público" da Fase 03 por "publicado", adiciona `publicationState` e os novos campos às respostas, e ajusta stream e download à mesma regra.

**Route:** GET /videos/:publicId
**Test Specs:** see `nestjs-project/specs/videos-publication-access.plan.md`
**Authorization:** Public com token opcional (publicado: qualquer pessoa com o link; demais estados: somente o dono)

**Technical actions:**

1. Criar `src/videos/publication-state.util.ts` — `derivePublicationState(video)` conforme a tabela de `### Data Model → publicationState` (per `phase-04-gerenciamento/TD-01`)
2. Atualizar `VideosService.findVisibleVideo` para considerar acessível o vídeo com `status = 'pronto'` e `published_at` preenchido (público ou unlisted) ou o dono, e reaproveitá-la em `getVideo` e `getPlaybackUrl`; o dono passa a obter stream e download de um `pronto` ainda não publicado (per `phase-04-gerenciamento/TD-01`, `phase-03-videos/TD-07`)
3. Atualizar `VideoResponseDto` e o mapeamento de `getVideo` com `description`, `publicationState`, `visibility`, `publishedAt`, `category` (`{ id, slug, name }` ou `null`, carregando a relação) e `viewCount`, `likeCount`, `dislikeCount`, `commentCount`
4. Atualizar os testes da Fase 03 que assumiam "pronto = público": helper `insertVideo` de `test/support/video-e2e.ts` (passa a definir `published_at` quando `status = 'pronto'`) e as expectativas de `videos.service.spec.ts`, `videos.service.integration-spec.ts`, `videos-get`, `videos-stream` e `videos-download`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `derivePublicationState` | Unit: um caso por linha da tabela de estados | `src/videos/publication-state.util.spec.ts` |
| `VideosService.getVideo` / `getPlaybackUrl` | Unit: matriz de acesso por estado, visibilidade e papel (mock repo) | `src/videos/videos.service.spec.ts` |
| `VideosService.getVideo` / `getPlaybackUrl` | Integration: regra de acesso e campos novos contra o banco | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.3

**Acceptance criteria:**

- `GET /videos/:publicId` anônimo de um vídeo `pronto` com `published_at` preenchido e `visibility: "unlisted"` retorna `200`
- `GET /videos/:publicId` anônimo de um vídeo `pronto` com `published_at` nulo retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `GET /videos/:publicId` pelo dono de um vídeo `pronto` com `published_at` nulo retorna `200` com `publicationState: "unpublished"`
- A resposta inclui `description`, `visibility`, `publishedAt`, `category` e os quatro contadores iguais a `0` para um vídeo recém-criado
- `publicationState` é `"processing"` para `processando`, `"error"` para `erro`, `"uploading"` para `rascunho` e `"published"` para `pronto` com `published_at`
- `GET /videos/:publicId/stream` anônimo de um vídeo publicado `unlisted` retorna `200`
- `GET /videos/:publicId/stream` anônimo de um vídeo `pronto` não publicado retorna `404`, e pelo dono retorna `200`
- `GET /videos/:publicId/download` anônimo de um vídeo `pronto` não publicado retorna `404` com `error: "VIDEO_NOT_FOUND"`

---

### SI-04.6 — Endpoint PATCH /videos/:publicId

**Description:** Permite ao dono editar título, descrição, categoria e visibilidade do vídeo.

**Route:** PATCH /videos/:publicId
**Test Specs:** see `nestjs-project/specs/videos-update.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Criar `src/videos/dto/update-video.dto.ts` — `UpdateVideoDto` (`title?`, `description?`, `categoryId?`, `visibility?`) conforme `#### Validation Rules — Phase 04`, com `trim` e rejeição de corpo vazio (per `phase-02-auth/TD-06`)
2. Em `VideosService`, criar `updateVideo(userId, publicId, dto)` — usa `findOwnedVideo`, lança `VideoUploadInProgressException` para `rascunho` com `upload_id`, valida a categoria (`CategoryNotFoundException`), aplica apenas os campos informados (`null` ou string vazia limpa a descrição) e devolve a resposta de `getVideo` (per `phase-04-gerenciamento/TD-01`, `phase-04-gerenciamento/TD-02`)
3. Em `VideosModule`, registrar `Category` no `TypeOrmModule.forFeature` e, em `VideosController`, adicionar `PATCH /videos/:publicId` (200)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.updateVideo` | Unit: campos parciais, categoria inexistente, upload aberto, não dono | `src/videos/videos.service.spec.ts` |
| `VideosService.updateVideo` | Integration: persistência das alterações e FK de categoria | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.1, SI-04.5

**Acceptance criteria:**

- `PATCH /videos/:publicId` pelo dono com `{ "title": "Novo título" }` retorna `200` com `title: "Novo título"`
- `PATCH /videos/:publicId` com `{ "description": null }` retorna `200` com `description: null`
- `PATCH /videos/:publicId` com `categoryId` de uma categoria existente retorna `200` com `category` preenchida
- `PATCH /videos/:publicId` com `categoryId` inexistente retorna `404` com `error: "CATEGORY_NOT_FOUND"`
- `PATCH /videos/:publicId` com `{ "visibility": "unlisted" }` retorna `200` com `visibility: "unlisted"`
- `PATCH /videos/:publicId` em um vídeo `rascunho` com upload aberto retorna `409` com `error: "VIDEO_UPLOAD_IN_PROGRESS"`
- `PATCH /videos/:publicId` com o token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `PATCH /videos/:publicId` com corpo `{}` ou `title` vazio retorna `400` com `error: "VALIDATION_ERROR"`
- `PATCH /videos/:publicId` sem header `Authorization` retorna `401`

---

### SI-04.7 — Endpoint POST /videos/:publicId/publish

**Description:** Publica o vídeo pronto, opcionalmente definindo a visibilidade no mesmo ato.

**Route:** POST /videos/:publicId/publish
**Test Specs:** see `nestjs-project/specs/videos-publish.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Criar `src/videos/dto/publish-video.dto.ts` — `PublishVideoDto` (`visibility?`) (per `phase-02-auth/TD-06`)
2. Em `VideosService`, criar `publishVideo(userId, publicId, dto)` — usa `findOwnedVideo`, exige `status = 'pronto'` (`VideoNotReadyException`), `published_at` nulo (`VideoAlreadyPublishedException`) e categoria definida (`CategoryRequiredException`), aplica `visibility` quando informada, grava `published_at` com o instante atual e devolve a resposta de `getVideo` (per `phase-04-gerenciamento/TD-01`)
3. Em `VideosController`, adicionar `POST /videos/:publicId/publish` (200)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.publishVideo` | Unit: pré-requisitos, idempotência de erro, visibilidade opcional | `src/videos/videos.service.spec.ts` |
| `VideosService.publishVideo` | Integration: `published_at` persistido e vídeo passa a ser acessível | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.1, SI-04.5

**Acceptance criteria:**

- `POST /videos/:publicId/publish` pelo dono de um vídeo `pronto` com categoria retorna `200` com `publicationState: "published"` e `publishedAt` preenchido
- `POST /videos/:publicId/publish` com `{ "visibility": "unlisted" }` retorna `200` com `visibility: "unlisted"`
- Antes de publicar, `GET /videos/:publicId` anônimo retorna `404`; depois de publicar retorna `200`
- `POST /videos/:publicId/publish` em um vídeo sem categoria retorna `400` com `error: "CATEGORY_REQUIRED"`
- `POST /videos/:publicId/publish` em um vídeo em `processando` retorna `409` com `error: "VIDEO_NOT_READY"`
- `POST /videos/:publicId/publish` em um vídeo já publicado retorna `409` com `error: "VIDEO_ALREADY_PUBLISHED"`
- `POST /videos/:publicId/publish` com `visibility` inválida retorna `400` com `error: "VALIDATION_ERROR"`
- `POST /videos/:publicId/publish` com o token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `POST /videos/:publicId/publish` sem header `Authorization` retorna `401`

---

### SI-04.8 — Endpoint PUT /videos/:publicId/thumbnail

**Description:** Recebe a thumbnail customizada, valida e normaliza a imagem com `sharp` e a grava no storage.

**Route:** PUT /videos/:publicId/thumbnail
**Test Specs:** see `nestjs-project/specs/videos-thumbnail.plan.md`
**Authorization:** Authenticated (somente o dono do vídeo)

**Technical actions:**

1. Criar `src/videos/thumbnail-image.service.ts` — `normalize(buffer)`: lê o formato com `sharp(buffer).metadata()`, aceita só `jpeg`, `png` e `webp` (`InvalidThumbnailException` caso contrário ou se a imagem estiver corrompida), redimensiona com `fit: inside` e `withoutEnlargement` para `thumbnailMaxWidth × thumbnailMaxHeight` e converte para JPEG (per `phase-04-gerenciamento/TD-03`)
2. Em `VideosService`, criar `replaceThumbnail(userId, publicId, file)` — usa `findOwnedVideo`, bloqueia `rascunho` com upload aberto, normaliza, grava `videos/{id}/thumbnail-custom.jpg` via `StorageService.putObject` (`image/jpeg`), atualiza `thumbnail_key` e devolve `thumbnailUrl` assinada (per `phase-03-videos/TD-05`, `phase-04-gerenciamento/TD-03`)
3. Configurar o Multer em `VideosModule` com `MulterModule.registerAsync` (limite `fileSize` de `videoConfig.thumbnailMaxBytes`) e mapear o erro de limite para `ThumbnailTooLargeException` (413) e a ausência do arquivo para `InvalidThumbnailException` (per `phase-04-gerenciamento/TD-03`)
4. Em `VideosController`, adicionar `PUT /videos/:publicId/thumbnail` com `FileInterceptor('file')` (200)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ThumbnailImageService` | Integration: `sharp` real com imagens JPEG, PNG e WebP, arquivo de texto e imagem truncada | `src/videos/thumbnail-image.service.integration-spec.ts` |
| `VideosService.replaceThumbnail` | Unit: fluxo, upload aberto, não dono (mock storage e normalizador) | `src/videos/videos.service.spec.ts` |
| `VideosService.replaceThumbnail` | Integration: objeto gravado no MinIO e `thumbnail_key` atualizado | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.1, SI-04.5

**Acceptance criteria:**

- `PUT /videos/:publicId/thumbnail` pelo dono com um PNG de 2000×1500 e menos de 2 MiB retorna `200` com `thumbnailUrl`
- `GET` na `thumbnailUrl` retornada responde com `Content-Type: image/jpeg` e imagem com no máximo 1280×720
- Após o `200`, `thumbnail_key` do vídeo é `videos/{id}/thumbnail-custom.jpg` e `GET /videos/:publicId` devolve a nova `thumbnailUrl`
- `PUT /videos/:publicId/thumbnail` com um arquivo de texto retorna `400` com `error: "INVALID_THUMBNAIL"`
- `PUT /videos/:publicId/thumbnail` sem o campo `file` retorna `400` com `error: "INVALID_THUMBNAIL"`
- `PUT /videos/:publicId/thumbnail` com arquivo acima de 2 MiB retorna `413` com `error: "THUMBNAIL_TOO_LARGE"`
- `PUT /videos/:publicId/thumbnail` com o token de outro usuário retorna `404` com `error: "VIDEO_NOT_FOUND"`
- `PUT /videos/:publicId/thumbnail` em um vídeo `rascunho` com upload aberto retorna `409` com `error: "VIDEO_UPLOAD_IN_PROGRESS"`
- `PUT /videos/:publicId/thumbnail` sem header `Authorization` retorna `401`

---

### SI-04.9 — Endpoint GET /me/channel

**Description:** Devolve o canal do usuário autenticado, base da edição do canal.

**Route:** GET /me/channel
**Test Specs:** see `nestjs-project/specs/me-channel-get.plan.md`
**Authorization:** Authenticated

**Technical actions:**

1. Criar `src/channels/dto/channel-response.dto.ts` — `ChannelResponseDto` (`id`, `nickname`, `name`, `description`, `createdAt`) (per `openapi-docs-nestjs/TD-01`)
2. Em `ChannelsService`, criar `findByUserId(userId)` que lança `ChannelNotFoundException` quando o usuário não tem canal
3. Criar `src/channels/my-channel.controller.ts` — `GET /me/channel` com `@CurrentUser()` e registrá-lo em `ChannelsModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ChannelsService.findByUserId` | Unit: canal encontrado e inexistente | `src/channels/channels.service.spec.ts` |
| `ChannelsService.findByUserId` | Integration: leitura contra o banco | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** SI-04.1

**Acceptance criteria:**

- `GET /me/channel` com token válido retorna `200` com `id`, `nickname`, `name`, `description` e `createdAt` do canal do usuário
- `GET /me/channel` de um canal sem descrição retorna `description: null`
- `GET /me/channel` sem header `Authorization` retorna `401`

---

### SI-04.10 — Endpoint PATCH /me/channel

**Description:** Permite editar nickname, nome e descrição do próprio canal.

**Route:** PATCH /me/channel
**Test Specs:** see `nestjs-project/specs/me-channel-update.plan.md`
**Authorization:** Authenticated

**Technical actions:**

1. Criar `src/channels/dto/update-channel.dto.ts` — `UpdateChannelDto` (`nickname?`, `name?`, `description?`) conforme `#### Validation Rules — Phase 04` (per `phase-02-auth/TD-06`, `phase-02-auth/TD-10`)
2. Mover `src/videos/pg-errors.util.ts` para `src/common/database/pg-errors.util.ts` e atualizar os imports (passa a ser usado por `videos` e `channels`)
3. Em `ChannelsService`, criar `updateChannel(userId, dto)` — aplica apenas os campos informados (`null` ou string vazia limpa a descrição), trata a violação de unicidade de `nickname` como `NicknameAlreadyExistsException` e mantém o sucesso idempotente quando o nickname informado é o atual (per `phase-04-gerenciamento/TD-06`)
4. Em `MyChannelController`, adicionar `PATCH /me/channel` (200)

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ChannelsService.updateChannel` | Unit: campos parciais, nickname atual, conflito | `src/channels/channels.service.spec.ts` |
| `ChannelsService.updateChannel` | Integration: unique de `nickname` e liberação do nome antigo | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** SI-04.9

**Acceptance criteria:**

- `PATCH /me/channel` com `{ "name": "Meu canal" }` retorna `200` com `name: "Meu canal"`
- `PATCH /me/channel` com um nickname livre retorna `200` com o novo `nickname`
- Depois da troca, outro usuário consegue assumir o nickname antigo com `PATCH /me/channel` e recebe `200`
- `PATCH /me/channel` com o nickname de outro canal retorna `409` com `error: "NICKNAME_ALREADY_EXISTS"`
- `PATCH /me/channel` com o próprio nickname atual retorna `200`
- `PATCH /me/channel` com `{ "description": "" }` retorna `200` com `description: null`
- `PATCH /me/channel` com `{ "nickname": "Nick Name" }` retorna `400` com `error: "VALIDATION_ERROR"`
- `PATCH /me/channel` com corpo `{}` retorna `400` com `error: "VALIDATION_ERROR"`
- `PATCH /me/channel` sem header `Authorization` retorna `401`

---

### SI-04.11 — Endpoint GET /me/videos

**Description:** Lista os vídeos do canal do usuário no painel de gerenciamento, com paginação por offset, ordenação e filtro por estado de publicação.

**Route:** GET /me/videos
**Test Specs:** see `nestjs-project/specs/me-videos.plan.md`
**Authorization:** Authenticated

**Technical actions:**

1. Criar `src/common/pagination/page-query.dto.ts` e `page-response.ts` — `page` (default 1), `pageSize` (default 20, máx. 100) e o envelope `{ items, page, pageSize, total }` (per `phase-04-gerenciamento/TD-04`)
2. Criar `src/videos/dto/list-my-videos-query.dto.ts` — estende `PageQueryDto` com `sort` (`createdAt` | `publishedAt` | `title` | `viewCount` | `likeCount` | `commentCount`), `order` e `publicationState` (per `phase-02-auth/TD-06`)
3. Em `VideosService`, criar `listMyVideos(userId, query)` — consulta com `QueryBuilder` restrita ao canal do usuário, mapeia `publicationState` para as condições de `status`/`published_at`, ordena por coluna da lista de permitidas, pagina com `skip`/`take`, devolve `total` e gera a `thumbnailUrl` assinada de cada item
4. Criar `src/videos/my-videos.controller.ts` — `GET /me/videos` e registrá-lo em `VideosModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `VideosService.listMyVideos` | Unit: mapeamento de `publicationState` e whitelist de ordenação | `src/videos/videos.service.spec.ts` |
| `VideosService.listMyVideos` | Integration: paginação, ordenação, filtro e total contra o banco | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.5

**Acceptance criteria:**

- `GET /me/videos` com token válido retorna `200` com `items`, `page: 1`, `pageSize: 20` e `total`
- A resposta contém apenas vídeos do canal do usuário do token
- Sem parâmetros, os itens vêm ordenados por `createdAt` decrescente
- `GET /me/videos?sort=viewCount&order=asc` retorna os itens em ordem crescente de `viewCount`
- Com cinco vídeos, `GET /me/videos?pageSize=2&page=2` retorna 2 itens e `total: 5`
- `GET /me/videos?publicationState=unpublished` retorna apenas vídeos `pronto` sem `published_at`
- Cada item traz `status`, `publicationState`, `visibility`, `publishedAt` e os quatro contadores
- `GET /me/videos?pageSize=101` ou `sort=invalido` retorna `400` com `error: "VALIDATION_ERROR"`
- `GET /me/videos` sem header `Authorization` retorna `401`

---

### SI-04.12 — Endpoint GET /channels/:nickname

**Description:** Página pública do canal: informações e quantidade de vídeos públicos.

**Route:** GET /channels/:nickname
**Test Specs:** see `nestjs-project/specs/channels-get.plan.md`
**Authorization:** Public

**Technical actions:**

1. Criar `src/channels/dto/public-channel-response.dto.ts` — `PublicChannelResponseDto` (`nickname`, `name`, `description`, `createdAt`, `videoCount`) (per `openapi-docs-nestjs/TD-01`)
2. Em `ChannelsService`, criar `findByNickname(nickname)` (lança `ChannelNotFoundException`) e `getPublicChannel(nickname)`, que conta os vídeos `pronto`, publicados e `public` do canal; registrar `Video` no `TypeOrmModule.forFeature` de `ChannelsModule` (per `phase-04-gerenciamento/TD-01`)
3. Criar `src/channels/channels.controller.ts` — `GET /channels/:nickname` com `@Public()` e registrá-lo em `ChannelsModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `ChannelsService.getPublicChannel` | Unit: canal inexistente e montagem da resposta | `src/channels/channels.service.spec.ts` |
| `ChannelsService.getPublicChannel` | Integration: `videoCount` conta só publicados e públicos | `src/channels/channels.service.integration-spec.ts` |

**Dependencies:** SI-04.1, SI-04.3

**Acceptance criteria:**

- `GET /channels/:nickname` anônimo retorna `200` com `nickname`, `name`, `description`, `createdAt` e `videoCount`
- `videoCount` conta apenas vídeos `pronto`, publicados e com `visibility: "public"` — vídeos `unlisted`, não publicados e em processamento não entram
- `GET /channels/:nickname` com um nickname inexistente retorna `404` com `error: "CHANNEL_NOT_FOUND"`

---

### SI-04.13 — Endpoint GET /channels/:nickname/videos

**Description:** Lista pública dos vídeos do canal com paginação por cursor, sem expor vídeos unlisted ou não publicados.

**Route:** GET /channels/:nickname/videos
**Test Specs:** see `nestjs-project/specs/channels-videos.plan.md`
**Authorization:** Public

**Technical actions:**

1. Criar `src/common/pagination/cursor.util.ts` — `encodeCursor({ publishedAt, id })` e `decodeCursor(cursor)` em base64url, lançando `InvalidCursorException` para valor malformado (per `phase-04-gerenciamento/TD-04`)
2. Criar `src/videos/dto/list-channel-videos-query.dto.ts` — `cursor?` e `limit` (default 24, 1–50) (per `phase-02-auth/TD-06`)
3. Em `VideosService`, criar `listChannelVideos(nickname, query)` — resolve o canal por `findByNickname`, filtra `pronto` + publicado + `public`, ordena por `published_at` e `id` decrescentes, aplica o cursor como condição keyset, busca `limit + 1` para calcular `nextCursor` e gera a `thumbnailUrl` assinada de cada item
4. Criar `src/videos/channel-videos.controller.ts` — `GET /channels/:nickname/videos` com `@Public()` e registrá-lo em `VideosModule`

**Tests:**

| Artifact | Layer | Test file |
|----------|-------|-----------|
| `encodeCursor` / `decodeCursor` | Unit: ida e volta, valores malformados | `src/common/pagination/cursor.util.spec.ts` |
| `VideosService.listChannelVideos` | Unit: filtro de visibilidade e cálculo do `nextCursor` | `src/videos/videos.service.spec.ts` |
| `VideosService.listChannelVideos` | Integration: keyset sem repetição entre páginas contra o banco | `src/videos/videos.service.integration-spec.ts` |

**Dependencies:** SI-04.5, SI-04.12

**Acceptance criteria:**

- `GET /channels/:nickname/videos` anônimo retorna `200` somente com vídeos `pronto`, publicados e `public` — `unlisted` e não publicados não aparecem
- Os itens vêm ordenados por `publishedAt` decrescente e cada um traz `id`, `title`, `thumbnailUrl`, `durationSeconds`, `publishedAt` e `viewCount`
- Com cinco vídeos publicados, `GET /channels/:nickname/videos?limit=2` retorna 2 itens e um `nextCursor`
- Usar o `nextCursor` retorna os próximos itens sem repetir nenhum já devolvido
- Na última página, `nextCursor` é `null`
- `GET /channels/:nickname/videos?cursor=invalido` retorna `400` com `error: "INVALID_CURSOR"`
- `GET /channels/:nickname/videos?limit=51` retorna `400` com `error: "VALIDATION_ERROR"`
- `GET /channels/:nickname/videos` com um nickname inexistente retorna `404` com `error: "CHANNEL_NOT_FOUND"`

---

## Technical Specifications

### Data Model

#### Category

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, generated | |
| slug | varchar(50) | unique, not null | kebab-case sem acento (ex.: `educacao`); identificador estável para filtros futuros (Fase 07) |
| name | varchar(100) | not null | Nome exibido (ex.: `Educação`) |
| sort_order | integer | not null | Ordem de exibição; `Outros` é a última |
| created_at | timestamp | not null, auto-generated | `@CreateDateColumn` |

**Relations:** Category has many Video (one-to-many)
**Indexes:** `(slug)` — unique
**Seed (na própria migration, per `phase-04-gerenciamento/TD-02`):** Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros — nessa ordem, `sort_order` 1–8.

#### Video (colunas adicionadas; as da Fase 03 permanecem)

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| description | text | nullable | Editável; no máximo 5000 caracteres na validação |
| category_id | uuid | FK → categories.id, nullable, `ON DELETE RESTRICT` | Obrigatória para publicar (per `phase-04-gerenciamento/TD-01`, `phase-04-gerenciamento/TD-02`) |
| visibility | enum | not null, default `'public'` | PostgreSQL enum `videos_visibility_enum`: `'public'`, `'unlisted'` (per `phase-04-gerenciamento/TD-01`) |
| published_at | timestamp | nullable | `NULL` = não publicado; preenchido no ato de publicar (per `phase-04-gerenciamento/TD-01`) |
| view_count | integer | not null, default `0` | Contadores denormalizados; incrementados nas Fases 05/06 (per `phase-04-gerenciamento/TD-05`) |
| like_count | integer | not null, default `0` | idem |
| dislike_count | integer | not null, default `0` | idem |
| comment_count | integer | not null, default `0` | idem |

**Relations:** Video → Category (many-to-one via `category_id`)
**Indexes:** `(category_id)`; `(channel_id, published_at, id)` — suporta a listagem pública do canal e o cursor (per `phase-04-gerenciamento/TD-04`)
**Backfill na migration:** vídeos existentes com `status = 'pronto'` recebem `published_at = updated_at` e `visibility = 'public'`, preservando a visibilidade pública que tinham na Fase 03 (exceção intencional à regra "categoria obrigatória para publicar", que vale só para novas publicações).

**`publicationState` (campo derivado, não persistido; per `phase-04-gerenciamento/TD-01`, Revision de 2026-10-13):**

| `status` técnico | `published_at` | `publicationState` | Rótulo no painel |
|------------------|----------------|--------------------|------------------|
| `rascunho` (com ou sem upload aberto) | — | `uploading` | Enviando |
| `processando` | — | `processing` | Processando |
| `erro` | — | `error` | Erro |
| `pronto` | `NULL` | `unpublished` | Rascunho |
| `pronto` | preenchido | `published` | Publicado (Público ou Não listado conforme `visibility`) |

Um `rascunho` técnico sem upload aberto (upload abortado por divergência de tamanho na Fase 03) permanece `uploading` até o dono cancelar via `DELETE /videos/:publicId/upload`.

---

### API Contracts

#### GET /categories (SI-04.4)

**Response 200:**
- items: array de `{ id: string (uuid), slug: string, name: string }`, ordenado por `sort_order`

**Error responses:** nenhum específico.

---

#### GET /videos/:publicId (SI-04.5)

Rota existente da Fase 03; muda a regra de acesso e o formato da resposta. Acesso: vídeo **publicado** (`status = 'pronto'` e `published_at` preenchido) é acessível a qualquer pessoa com o link, seja `public` ou `unlisted`; qualquer outro estado é visível somente ao dono do canal.

**Request headers:**
- Authorization: Bearer {accessToken} — opcional

**Response 200:**
- id: string (`public_id`)
- title: string
- description: string | null
- status: string — `rascunho` | `processando` | `pronto` | `erro`
- publicationState: string — `uploading` | `processing` | `error` | `unpublished` | `published`
- visibility: string — `public` | `unlisted`
- publishedAt: string (ISO 8601) | null
- category: `{ id, slug, name }` | null
- durationSeconds: number | null
- thumbnailUrl: string | null — presigned GET URL
- errorReason: string | null — somente para o dono em `erro`
- viewCount, likeCount, dislikeCount, commentCount: integer
- createdAt: string (ISO 8601)

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente, ou não publicado e o chamador não é o dono

`GET /videos/:publicId/stream` e `GET /videos/:publicId/download` (Fase 03) passam a usar a mesma regra de acesso (SI-04.5); o contrato de resposta não muda.

---

#### PATCH /videos/:publicId (SI-04.6)

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:** (todos opcionais; ao menos um campo)
- title: string — 1–255 caracteres após `trim`
- description: string | null — até 5000 caracteres; `null` ou string vazia limpa a descrição
- categoryId: string (uuid) — deve existir em `categories`
- visibility: string — `public` | `unlisted`

**Response 200:** mesmo formato de `GET /videos/:publicId`.

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou de outro canal
- 404 CATEGORY_NOT_FOUND: `categoryId` inexistente
- 409 VIDEO_UPLOAD_IN_PROGRESS: vídeo em `rascunho` com upload aberto
- 400 validation error: corpo vazio ou campos inválidos
- 401: sem token ou token inválido

---

#### POST /videos/:publicId/publish (SI-04.7)

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:**
- visibility: string, opcional — `public` | `unlisted`; quando informado, substitui a visibilidade atual antes de publicar

**Response 200:** mesmo formato de `GET /videos/:publicId`, com `publicationState: "published"` e `publishedAt` preenchido.

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou de outro canal
- 409 VIDEO_NOT_READY: `status` diferente de `pronto`
- 409 VIDEO_ALREADY_PUBLISHED: `published_at` já preenchido
- 400 CATEGORY_REQUIRED: vídeo sem categoria
- 400 validation error: `visibility` inválida
- 401: sem token ou token inválido

---

#### PUT /videos/:publicId/thumbnail (SI-04.8)

**Request headers:**
- Content-Type: multipart/form-data
- Authorization: Bearer {accessToken}

**Request body (multipart):**
- file: binary, obrigatório — JPEG, PNG ou WebP, até 2 MiB; a API valida o formato pelo conteúdo, redimensiona para no máximo 1280×720 (sem ampliar) e grava como JPEG

**Response 200:**
- thumbnailUrl: string — presigned GET URL da nova thumbnail

**Error responses:**
- 404 VIDEO_NOT_FOUND: vídeo inexistente ou de outro canal
- 409 VIDEO_UPLOAD_IN_PROGRESS: vídeo em `rascunho` com upload aberto
- 400 INVALID_THUMBNAIL: arquivo ausente, formato fora de JPEG/PNG/WebP ou conteúdo corrompido
- 413 THUMBNAIL_TOO_LARGE: arquivo acima de 2 MiB
- 401: sem token ou token inválido

---

#### GET /me/channel (SI-04.9)

**Request headers:**
- Authorization: Bearer {accessToken}

**Response 200:**
- id: string (uuid)
- nickname: string
- name: string
- description: string | null
- createdAt: string (ISO 8601)

**Error responses:**
- 401: sem token ou token inválido

---

#### PATCH /me/channel (SI-04.10)

**Request headers:**
- Content-Type: application/json
- Authorization: Bearer {accessToken}

**Request body:** (todos opcionais; ao menos um campo)
- nickname: string — 1–50 caracteres, somente `[a-z0-9_]`, único globalmente; o nome antigo é liberado imediatamente (per `phase-04-gerenciamento/TD-06`)
- name: string — 1–50 caracteres após `trim`
- description: string | null — até 1000 caracteres; `null` ou string vazia limpa a descrição

**Response 200:** mesmo formato de `GET /me/channel`.

**Error responses:**
- 409 NICKNAME_ALREADY_EXISTS: nickname já usado por outro canal
- 400 validation error: corpo vazio ou campos inválidos
- 401: sem token ou token inválido

---

#### GET /me/videos (SI-04.11)

Painel de gerenciamento do dono; paginação por offset (per `phase-04-gerenciamento/TD-04`).

**Request headers:**
- Authorization: Bearer {accessToken}

**Request query parameters:**
- page: integer, opcional, default 1, mínimo 1
- pageSize: integer, opcional, default 20, entre 1 e 100
- sort: string, opcional, default `createdAt` — `createdAt` | `publishedAt` | `title` | `viewCount` | `likeCount` | `commentCount`
- order: string, opcional, default `desc` — `asc` | `desc`
- publicationState: string, opcional — filtra por `uploading` | `processing` | `error` | `unpublished` | `published`

**Response 200:**
- items: array de `{ id, title, thumbnailUrl, status, publicationState, visibility, publishedAt, createdAt, viewCount, likeCount, dislikeCount, commentCount }` (mesmos tipos de `GET /videos/:publicId`)
- page: integer
- pageSize: integer
- total: integer — total de itens após o filtro

**Error responses:**
- 400 validation error: parâmetros fora dos valores permitidos
- 401: sem token ou token inválido

---

#### GET /channels/:nickname (SI-04.12)

**Response 200:**
- nickname: string
- name: string
- description: string | null
- createdAt: string (ISO 8601)
- videoCount: integer — vídeos publicados e `public` do canal

**Error responses:**
- 404 CHANNEL_NOT_FOUND: nickname inexistente

---

#### GET /channels/:nickname/videos (SI-04.13)

Listagem pública do canal; paginação por cursor/keyset (per `phase-04-gerenciamento/TD-04`). Inclui somente vídeos publicados (`status = 'pronto'`, `published_at` preenchido) com `visibility = 'public'`; `unlisted` nunca aparece.

**Request query parameters:**
- cursor: string, opcional — valor opaco devolvido em `nextCursor`
- limit: integer, opcional, default 24, entre 1 e 50

**Response 200:**
- items: array de `{ id, title, thumbnailUrl, durationSeconds, publishedAt, viewCount }`, ordenado por `publishedAt` desc e `id` desc
- nextCursor: string | null — `null` na última página

**Error responses:**
- 404 CHANNEL_NOT_FOUND: nickname inexistente
- 400 INVALID_CURSOR: `cursor` malformado
- 400 validation error: `limit` fora do intervalo

---

#### Validation Rules — Phase 04

- `title`: string, 1–255 caracteres após `trim`
- `description` (vídeo): string ou `null`, até 5000 caracteres
- `categoryId`: uuid
- `visibility`: `public` | `unlisted`
- `nickname`: `^[a-z0-9_]{1,50}$`
- `name` (canal): string, 1–50 caracteres após `trim`
- `description` (canal): string ou `null`, até 1000 caracteres
- `page` ≥ 1; `pageSize` 1–100; `sort`, `order`, `publicationState` dentro dos valores listados
- `limit` 1–50; `cursor`: string opaca decodificável

---

### Authorization Matrix

| Endpoint | Anonymous | Authenticated | Owner | Notes |
|----------|-----------|---------------|-------|-------|
| GET /categories | ✓ | ✓ | ✓ | `@Public()` |
| GET /videos/:publicId | ✓ (publicado) | ✓ (publicado) | ✓ (qualquer estado) | `@OptionalAuth()`; publicado = `pronto` + `published_at`; `unlisted` acessível por link |
| GET /videos/:publicId/stream, /download | ✓ (publicado) | ✓ (publicado) | ✓ (publicado) | mesma regra; dono recebe 409 enquanto não `pronto` |
| PATCH /videos/:publicId | ✗ | ✗ | ✓ | Não dono recebe 404 VIDEO_NOT_FOUND |
| POST /videos/:publicId/publish | ✗ | ✗ | ✓ | idem |
| PUT /videos/:publicId/thumbnail | ✗ | ✗ | ✓ | idem |
| GET /me/channel | ✗ | ✓ | ✓ | Canal do usuário do token |
| PATCH /me/channel | ✗ | ✓ | ✓ | idem |
| GET /me/videos | ✗ | ✓ | ✓ | Somente vídeos do canal do token |
| GET /channels/:nickname | ✓ | ✓ | ✓ | `@Public()` |
| GET /channels/:nickname/videos | ✓ | ✓ | ✓ | `@Public()`; só publicados e `public` |

---

### Error Catalog

**Error response format:** herdado da Fase 02 — `{ statusCode: number, error: string, message: string }`; `VALIDATION_ERROR` com `message` em array para falhas de validação.

| Code | HTTP | Message | Trigger |
|------|------|---------|---------|
| CATEGORY_NOT_FOUND | 404 | Category not found | `PATCH /videos/:publicId` com `categoryId` inexistente |
| CATEGORY_REQUIRED | 400 | Category is required to publish | `POST /videos/:publicId/publish` com vídeo sem categoria |
| VIDEO_UPLOAD_IN_PROGRESS | 409 | Video upload is still in progress | `PATCH /videos/:publicId` ou `PUT /videos/:publicId/thumbnail` em vídeo `rascunho` com upload aberto |
| VIDEO_ALREADY_PUBLISHED | 409 | Video is already published | `POST /videos/:publicId/publish` com `published_at` já preenchido |
| INVALID_THUMBNAIL | 400 | Thumbnail must be a valid JPEG, PNG or WebP image | `PUT /videos/:publicId/thumbnail` sem arquivo, com formato não suportado ou conteúdo inválido |
| THUMBNAIL_TOO_LARGE | 413 | Thumbnail exceeds the 2 MiB limit | `PUT /videos/:publicId/thumbnail` acima do limite |
| NICKNAME_ALREADY_EXISTS | 409 | Nickname is already in use | `PATCH /me/channel` com nickname de outro canal |
| CHANNEL_NOT_FOUND | 404 | Channel not found | `GET /channels/:nickname` e `/channels/:nickname/videos` com nickname inexistente |
| INVALID_CURSOR | 400 | Cursor is invalid | `GET /channels/:nickname/videos` com `cursor` malformado |

Códigos reutilizados da Fase 03: `VIDEO_NOT_FOUND` (404) e `VIDEO_NOT_READY` (409).

---

## Dependency Map

SI-04.1 (root — sharp, config e exceções)
├── SI-04.6 — depends on SI-04.1 + SI-04.5 (PATCH usa exceções e a resposta unificada)
├── SI-04.7 — depends on SI-04.1 + SI-04.5 (publicação usa exceções e a regra de acesso)
├── SI-04.8 — depends on SI-04.1 + SI-04.5 (thumbnail usa `sharp`, config e exceções)
├── SI-04.9 — depends on SI-04.1 (GET /me/channel usa `ChannelNotFoundException`)
│   └── SI-04.10 — depends on SI-04.9 (PATCH reutiliza o controller e o DTO de resposta)
└── SI-04.12 — depends on SI-04.1 + SI-04.3 (contagem usa as colunas de publicação)
    └── SI-04.13 — depends on SI-04.5 + SI-04.12 (listagem reutiliza `findByNickname` e a regra de publicação)
SI-04.2 (root — Category)
├── SI-04.3 — depends on SI-04.2 (Video referencia Category)
│   └── SI-04.5 — depends on SI-04.3 (regra de acesso usa as novas colunas)
│       └── SI-04.11 — depends on SI-04.5 (painel usa `derivePublicationState`)
└── SI-04.4 — depends on SI-04.2 (GET /categories lê a tabela)

---

## Deliverables

- [ ] SI-04.1 — Infra: sharp, tipos do Multer, configuração de thumbnail e exceções de domínio
- [ ] SI-04.2 — Criar entidade Category e migration com seed
- [ ] SI-04.3 — Colunas de edição, publicação e contadores em Video
- [ ] SI-04.4 — Endpoint GET /categories
- [ ] SI-04.5 — Regra de acesso por publicação e publicationState
- [ ] SI-04.6 — Endpoint PATCH /videos/:publicId
- [ ] SI-04.7 — Endpoint POST /videos/:publicId/publish
- [ ] SI-04.8 — Endpoint PUT /videos/:publicId/thumbnail
- [ ] SI-04.9 — Endpoint GET /me/channel
- [ ] SI-04.10 — Endpoint PATCH /me/channel
- [ ] SI-04.11 — Endpoint GET /me/videos
- [ ] SI-04.12 — Endpoint GET /channels/:nickname
- [ ] SI-04.13 — Endpoint GET /channels/:nickname/videos

**Full test suites:**

- [ ] Backend tests pass (`cd nestjs-project && docker compose exec nestjs-api npm test -- --runInBand`)
- [ ] E2E tests pass (`cd nestjs-project && docker compose exec nestjs-api npm run test:e2e`)
- [ ] Type/compilation checks pass (`cd nestjs-project && docker compose exec nestjs-api npx tsc --noEmit`)
- [ ] `openapi.json` regenerado e commitado (`cd nestjs-project && docker compose exec nestjs-api npm run openapi:export`)
