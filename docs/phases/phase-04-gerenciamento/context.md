---
kind: phase
name: phase-04-gerenciamento
sources_mtime:
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
  docs/phases/phase-04-gerenciamento/library-refs.md: "2026-10-13T14:15:39-03:00"
  .claude/skills/testing-guide-nestjs-project/SKILL.md: "2026-10-13T13:55:03-03:00"
---

# phase-04-gerenciamento — Context

## Scope

**Phase name:** Gerenciamento de Vídeos e Canal
**Capabilities** (literal, `docs/project-plan.md`):

- Categorias de vídeo disponíveis na plataforma
- Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada
- Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link)
- Fluxo de rascunho → publicação
- Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)
- Edição de vídeos a partir do painel
- Edição das informações do canal: nickname, nome e descrição
- Página pública do canal com informações e listagem de vídeos

**Out of scope:** _Not specified._
**Deliverables:** edição completa de vídeos, rascunho/publicação, painel de gerenciamento, edição de canal, página pública do canal.
**Affected subprojects:** `nestjs-project/` (backend). `next-frontend/` não é afetado nesta fase: a pesquisa foi restrita ao backend por decisão do usuário (2026-10-13); as telas do painel, da edição e da página pública do canal ficam para uma fase/fatia de frontend.
**Deferred subprojects:** `next-frontend/` (painel de gerenciamento, edição de vídeo e de canal, página pública do canal).
**Sequencing notes:** Depende de: Fase 02, Fase 03. Description: "Edição das informações do vídeo, fluxo de rascunho e publicação, painel de administração do canal e página pública."

**Neighbors (for boundary detection only):**

- **Phase 03:** Upload de arquivos grandes sem travar o sistema, processamento automático do vídeo e geração de URL única. (Upload e Processamento de Vídeos)
- **Phase 05:** Página de Visualização do Vídeo; depende de Fase 03, Fase 04.

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries | Renders in |
|-----|--------|-------|-------|--------|----------|-----------|------------|
| phase-04-gerenciamento/TD-01 | phase | Cross-layer | Modelo de publicação e visibilidade do vídeo | decided | A (published_at + visibility, ortogonal ao status técnico) | — | — |
|     └─ Last revision: 2026-10-13 — Contrato do estado exposto ao painel definido: a API devolve `publicationState` ∈ {`uploading`, `processing`… | | | | | | | |
| phase-04-gerenciamento/TD-02 | phase | Backend | Categorias de vídeo | decided | A (tabela categories semeada por migration, API somente leitura) | — | — |
|     └─ Last revision: 2026-10-13 — Lista inicial confirmada para o seed: Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia… | | | | | | | |
| phase-04-gerenciamento/TD-03 | phase | Cross-layer | Upload da thumbnail customizada | decided | B (multipart via API com validação e normalização por sharp) | sharp | — |
| phase-04-gerenciamento/TD-04 | phase | Cross-layer | Convenção de paginação e ordenação das listagens | decided | C (offset no painel, cursor nas listagens públicas) | — | — |
| phase-04-gerenciamento/TD-05 | phase | Backend | Contadores de visualizações, likes e comentários no painel | decided | A (colunas de contador denormalizadas com valor 0) | — | — |
| phase-04-gerenciamento/TD-06 | phase | Backend | Política de alteração do nickname do canal | decided | A (nickname livre, único, nome antigo liberado) | — | — |

_Source files:_

- phase-04-gerenciamento — `docs/decisions/technical-decisions-phase-04-gerenciamento.md` (scope_type: phase, related_phases: [4])

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Categorias de vídeo disponíveis na plataforma | phase-04-gerenciamento/TD-02 |
| Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada | phase-04-gerenciamento/TD-03 |
| Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link) | phase-04-gerenciamento/TD-01 |
| Fluxo de rascunho → publicação | phase-04-gerenciamento/TD-01 |
| Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status) | phase-04-gerenciamento/TD-01, phase-04-gerenciamento/TD-04, phase-04-gerenciamento/TD-05 |
| Edição de vídeos a partir do painel | phase-04-gerenciamento/TD-01 |
| Edição das informações do canal: nickname, nome e descrição | phase-04-gerenciamento/TD-06 |
| Página pública do canal com informações e listagem de vídeos | phase-04-gerenciamento/TD-04, phase-04-gerenciamento/TD-06 |

## Decisions Detail

### phase-04-gerenciamento/TD-01

**Recommendation:** separa processamento de publicação sem reabrir os TDs da Fase 03 e entrega o "tempo de publicação" do painel de graça. Regras associadas à recomendação: publicar exige `status = pronto` (senão `409 VIDEO_NOT_READY`), título preenchido e categoria definida (a categoria sustenta as sugestões da Fase 05 e o filtro da Fase 07); edição de título, descrição, categoria, thumbnail e visibilidade é permitida em qualquer status exceto `rascunho` com upload aberto; vídeo `pronto` mas não publicado é visível só ao dono (regra atual de "não pronto"); despublicar fica fora da fase, pois o plano só descreve rascunho → publicação.
**Libraries:** —

**Revisions:**
- 2026-10-13 — Contrato do estado exposto ao painel definido: a API devolve `publicationState` ∈ {`uploading`, `processing`, `error`, `unpublished`, `published`}, derivado de `status`, `published_at` e `visibility` (`uploading` = `rascunho` técnico com upload aberto; `unpublished` = `pronto` sem `published_at`); `status`, `visibility` e `published_at` continuam expostos. Rótulos do painel: Enviando, Processando, Erro, Rascunho, Publicado (Público/Não listado). Rationale: o "rascunho" do bullet "Fluxo de rascunho → publicação" colidia com o `rascunho` técnico da Fase 03 (AMB-2).

### phase-04-gerenciamento/TD-02

**Recommendation:** dá integridade referencial e leitura simples para as Fases 05/07 sem criar administração que o plano não pede. Lista inicial sugerida para a migration (a confirmar): Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros.
**Libraries:** —

**Revisions:**
- 2026-10-13 — Lista inicial confirmada para o seed: Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros (slug em kebab-case sem acento; ordem alfabética com "Outros" por último). Rationale: a lista estava marcada como "a confirmar" na recomendação (AMB-1).

### phase-04-gerenciamento/TD-03

**Recommendation:** validar e normalizar na API entrega thumbnails previsíveis para painel, página do canal, home e sugestões; o custo é uma dependência (`sharp`, CommonJS, a validar no container Node 25). Evitar `file-type` direto (ESM-only); usar a validação por assinatura do próprio `ParseFilePipe` ou a leitura de formato do `sharp`.
**Libraries:** sharp

### phase-04-gerenciamento/TD-04

**Recommendation:** o painel é uma tabela com colunas ordenáveis e poucos itens por canal, enquanto as listagens públicas crescem e se beneficiam de keyset. Fixar agora evita reabrir a convenção na Fase 07. Registra-se o custo de dois envelopes; se a equipe preferir um só, Option A com revisão futura na Fase 07 é a alternativa mais simples.
**Libraries:** —

### phase-04-gerenciamento/TD-05

**Recommendation:** alinhada à orientação dada pelo usuário em 2026-10-13 (criar colunas de contador com valor 0). A estratégia de incremento e de consistência fica para as TDs das Fases 05/06.
**Libraries:** —

### phase-04-gerenciamento/TD-06

**Recommendation:** o plano não pede preservação de links e a página pública ainda não é referenciada por nenhum artefato persistente (as URLs de vídeo usam `public_id`, não o nickname). Se a Fase 06/07 passar a incorporar links de canal (inscrições, busca), o histórico da Option B pode entrar como Revision/Supersede.
**Libraries:** —

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** Option A (@nestjs/config) — Official, core-team-maintained, guaranteed NestJS 11 compatibility. The `registerAs()` factory pattern solves the TypeORM CLI sharing problem: the factory function can be imported as a plain function by `data-source.ts` while also serving as a DI injection token inside NestJS. Building a custom module recreates solved functionality; third-party packages carry maintenance risk.
**Libraries:** `@nestjs/config@^4.x`

### phase-01-configuracao-base/TD-02

**Recommendation:** Option A (Joi) — First-class integration with `@nestjs/config` via `validationSchema`, requiring zero custom wiring. Handles string-to-number coercion natively. Using a different tool for env validation vs. request validation is reasonable — env config is validated once at startup, DTOs are validated per-request. Zod is elegant but adds a third validation paradigm to the project.
**Libraries:** `joi@^17.x`

### phase-01-configuracao-base/TD-03

**Recommendation:** Option B (Namespaced/grouped with registerAs) — The project roadmap explicitly calls for auth, email, and storage in upcoming phases. Namespaced configs provide clear file boundaries per domain, typed injection via `ConfigType<typeof databaseConfig>`, and natural scalability. The `registerAs()` factory is dual-purpose: DI token inside NestJS and plain importable function for `data-source.ts`. Initial files for Phase 01: `src/config/database.config.ts`, `src/config/app.config.ts`.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Option A (Shared registerAs factory) — Natural outcome of choosing `@nestjs/config` with `registerAs`. The factory is already callable by design. `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication, minimal code, no extra abstraction.
**Libraries:** `dotenv` (transitive via `@nestjs/config`)

### phase-02-auth/TD-01

**Recommendation:** Argon2id — For a greenfield project in 2026, Argon2id is the OWASP-recommended choice. The native build dependency is a one-time Docker setup cost. The project has no legacy constraints favoring bcrypt. OWASP minimum: 19MiB memory, 2 iterations.
**Libraries:** `argon2@^0.41.x`

### phase-02-auth/TD-02

**Recommendation:** Option A (@nestjs/passport) — The project plan includes only email/password auth for now, but the plugin architecture costs little and future phases may add social login. Aligns with official NestJS docs, making onboarding and maintenance easier.

**Note:** Decision deliberately diverged from the Recommendation during implementation — custom guards were preferred over `@nestjs/passport` to keep the dependency surface smaller; social login is not on the near-term roadmap, so the plugin-architecture benefit did not justify the extra abstraction layer.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-03

**Recommendation:** Option A (Refresh Token Rotation) — Provides the strongest security model with automatic theft detection. The DB write overhead is acceptable for a video platform (auth refresh is infrequent vs. video operations). PostgreSQL is already in the stack, so no new infrastructure needed. Race conditions can be mitigated with a short grace period for the old token.
**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Option B (Random Opaque Tokens in DB) — Revocability is important: when a user requests a new password reset, previous tokens should be invalidated. The DB table is trivial to implement, and the tokens table can also serve future needs (e.g., API keys). Keeps email tokens decoupled from the JWT auth system.
**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** Option A (@nestjs-modules/mailer) — Best NestJS integration with minimal boilerplate. Supports SMTP (matching the architecture diagram), works with MailHog/Mailpit for local development without external dependencies, and scales to any SMTP provider in production. Template engine support (Handlebars) simplifies email formatting. No vendor lock-in.
**Libraries:** `@nestjs-modules/mailer@^2.x`, `handlebars@^4.x`

### phase-02-auth/TD-06

**Recommendation:** Option A (class-validator + class-transformer) — This is a backend-only project (no shared schemas with frontend), so Zod's single-source-of-truth advantage is less impactful. class-validator is the documented NestJS approach, and the project already uses decorators extensively (TypeORM entities, NestJS DI). Fewer integration surprises with NestJS 11.
**Libraries:** `class-validator@^0.14.x`, `class-transformer@^0.5.x`

### phase-02-auth/TD-07

**Recommendation:** Option A (Custom Domain Exception Filter) — Provides machine-readable error codes that the Next.js frontend can switch on, without the overhead of RFC 9457's URI-based type system. The project is single-consumer (first-party frontend), so a simple `{ statusCode, error, message }` format with domain codes balances clarity and simplicity. The custom filter cost is low — two small files.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** Option A (@nestjs/throttler) — Native NestJS integration is decisive: the guard system allows scoping rate limiting to `AuthModule` only via module-level `APP_GUARD`, with `@SkipThrottle()` for exemptions. The project is single-instance with no distributed requirements, so in-memory storage is sufficient. Using express-rate-limit would bypass NestJS's DI and guard lifecycle for no clear benefit.
**Libraries:** `@nestjs/throttler@^6.x`

### phase-02-auth/TD-09

**Recommendation:** Option B (Opaque) — Since DB lookup is mandatory (TD-03), JWT signature adds no security value. Opaque tokens are shorter, leak no data, and are simpler to generate.

**Note:** Decision deliberately diverged from the Recommendation — JWT was kept to reuse the access-token signing/verification infrastructure (`@nestjs/jwt`), trading token size and base64-readability for a single token format across the codebase.

**Libraries:** `@nestjs/jwt@^11.0.0`

### phase-02-auth/TD-10

**Recommendation:** Option A — The platform is a video sharing service with URL-based channel handles. A strict `[a-z0-9_]` allowlist is the simplest and most portable choice: no extra dependencies, no edge cases around hyphen positioning, and the `user_<random>` fallback provides a valid handle even for extreme email prefixes. Hyphens can always be added in a future iteration if user feedback justifies it.
**Libraries:** —

### phase-02-auth-frontend/TD-01

**Recommendation:** Three reasons. (1) **Architectural fit.** The strict-BFF model in `next-frontend-config-base/TD-03` already nominates the Route Handler as the only NestJS caller; cookie-based sessions are the natural match, and Auth.js's framework adds layers between the BFF and the cookie that buy nothing because the backend is the auth authority — Auth.js's value (DB adapters, OAuth providers, magic-link, `getServerSession` helpers) is mostly unused in this configuration. (2) **Smaller blast radius.** A ~50-LOC session helper is grep-friendly, debuggable, and test-friendly via the existing MSW+BFF integration test pattern; a misconfigured Auth.js callback is a longer fault-isolation loop. (3) **Compatibility with Next.js 16 / React 19.** Built-in `next/headers` `cookies()` is the canonical primitive both runtimes already use; Auth.js v5 versions track Next.js majors with a lag, adding compatibility risk that Option A does not have. Option C is rejected as unsafe (`localStorage` for refresh tokens) and architecturally regressive (loses RSC personalization).
**Libraries:** —

### phase-02-auth-frontend/TD-02

**Recommendation:** Three reasons. (1) **Defense in depth on the cookie content** — `httpOnly` blocks JS, encryption blocks accidental log/proxy inspection; the marginal cost is one ~3KB dep. (2) **Single cookie to manage** simplifies logout (one `session.destroy()` call) and avoids the orphan-cookie failure mode of Option A. (3) **Room to carry minimal user metadata** (`userId`, `email`, `channelSlug`) lets `app/layout.tsx` RSC render the authenticated chrome (avatar, channel name) without a per-render `/auth/me` round-trip — Phase 04+ gains compound here. Option A is a viable downgrade if the team rejects `iron-session` for any reason; the migration A→B (or B→A) is a one-Route-Handler refactor with no test changes downstream because the BFF interface is unchanged. Option C is rejected: it solves a problem (server-side revocation) the project does not have at the cost of infrastructure the project does not own.
**Libraries:** iron-session

### phase-02-auth-frontend/TD-03

**Recommendation:** The single-flight detail is non-trivial and goes in the helper from day one — tested by MSW with a "two concurrent intercepted upstream calls; one refresh expected" assertion. Option B's client-driven pattern is rejected because it doesn't replace Option A (RSC still needs server-side refresh) — adopting B means doing both. Option C's pre-emptive timer is rejected because the failure modes (multiple tabs, sleep/wake) outweigh the latency saving and force a `"use client"` shell near the root.
**Libraries:** —

### phase-02-auth-frontend/TD-04

**Recommendation:** Three reasons. (1) **Decoupled from TD-05** — works with Route Handlers OR Server Actions; the form code does not change if TD-05 is revisited later. (2) **Aligned with shadcn's canonical form primitive** — the project already commits to `radix-nova` shadcn (`components.json`); `npx shadcn@latest add form` produces react-hook-form wrappers; choosing react-hook-form means using the supported primitive instead of hand-rolling around it. (3) **Zod-first developer ergonomics match the rest of the FE foundation** — `next-frontend-config-base/TD-01` chose Zod 4 for env; the same schemas-as-source-of-truth pattern carries to forms with zero new validator paradigm. Option B is rejected for impedance with shadcn's primitive and for over-investing in progressive-enhancement that the strict-BFF model does not require. Option C is rejected for the per-field boilerplate and the loss of client-side feedback on a project that values quick, type-safe form iteration.
**Libraries:** react-hook-form, @hookform/resolvers

### phase-02-auth-frontend/TD-05

**Recommendation:** Three reasons. (1) **Strict-BFF alignment.** `next-frontend-config-base/TD-03` named Route Handlers as the BFF surface; Option A keeps every mutation visible under `app/api/**`. (2) **Test scaffold already exists** — `next-frontend/CLAUDE.md` § Testing and `next-frontend-msw-foundation` were authored for Route-Handlers-as-functions; Option A reuses them with zero invention. (3) **Single mutation surface** — Phase 02 sets the precedent for Phases 03–07; uniformity beats per-mutation idiom-picking when the cost of inconsistency compounds (Option C). Option B has real ergonomic appeal for the simplest forms but fragments the BFF surface and forces test-pattern reinvention; if the team later wants progressive enhancement for specific forms, the migration A→B is per-form and doesn't require touching unrelated routes — A is the safer default and the cheaper baseline.
**Libraries:** —

### phase-02-auth-frontend/TD-06

**Recommendation:** Two reinforcing reasons. (1) **No first-render flicker, no round-trip** — the session is delivered in the same response as the page HTML; the Client Provider hydrates with the correct initial state; users never see "Login" briefly turn into their avatar. (2) **No new BFF endpoint** — the cookie is the source of truth, RSC reads it, the Provider broadcasts it; the BFF surface stays minimal. The `router.refresh()` requirement after mid-session mutations is a small price (one line in the relevant mutation handler) for the structural benefits. Option B is rejected for the double-read-and-flicker; Option C is dominated by Option B and rejected.
**Libraries:** —

### phase-02-auth-frontend/TD-07

**Recommendation:** Three reasons. (1) **First-paint-correct** — the user sees the right outcome on the first paint, no skeleton, no flicker. (2) **Single integration pattern across both flows** — confirmation is RSC-only; reset is RSC + Client form (TD-04, TD-05 patterns reused) — both share the "RSC owns the token, Client Component owns the input" split. (3) **Email-prefetch behavior** is solved at the backend's idempotent-confirmation level (a small note for `/plan-build` to confirm; not a separate TD). Option B's Route-Handler-as-link-target adds redirects for no clean gain. Option C is dominated.
**Libraries:** —

### phase-03-videos/TD-01

**Recommendation:** BullMQ + Redis. Retry com backoff e estado de falha nativos reduzem código próprio no ciclo de status; integração oficial com NestJS 11. Custo: serviço Redis no Compose; enqueue não é transacional com o banco, mitigado criando a linha do vídeo antes do enqueue (TD-08).
**Libraries:** bullmq, @nestjs/bullmq

### phase-03-videos/TD-02

**Recommendation:** Multipart upload com URLs assinadas por parte (`UploadPart`), direto ao MinIO/S3: a API cria o rascunho e o multipart upload, emite URLs por parte, lista partes enviadas (`ListParts`) para retomar e finaliza com `CompleteMultipartUpload`. Definir na implementação: tamanho de parte (ex.: 16 MiB → 640 partes para 10GB), TTL das URLs e lifecycle para uploads abandonados.
**Libraries:** @aws-sdk/client-s3, @aws-sdk/s3-request-presigner

### phase-03-videos/TD-03

**Recommendation:** Mesmo codebase e imagem, com entrypoint dedicado do NestJS (application context sem HTTP) e `ffmpeg`/`ffprobe` instalados; extração via `ffprobe -print_format json` por `child_process`. Evita o wrapper deprecated `fluent-ffmpeg`. Definir na implementação: se a API compartilha a imagem com FFmpeg ou se o serviço `video-worker` usa imagem própria da mesma base.
**Libraries:** —

### phase-03-videos/TD-04

**Recommendation:** Frame em posição relativa fixa (10% da duração, mínimo 1s), calculada a partir da duração obtida pelo ffprobe. Determinístico e barato em vídeos grandes; thumbnail customizada é Fase 04.
**Libraries:** —

### phase-03-videos/TD-05

**Recommendation:** Bucket único com chaves por UUID interno: `videos/{videoId}/original.{ext}` e `videos/{videoId}/thumbnail.jpg`; nunca por slug. Uma configuração de bucket e de CORS/lifecycle; storage desacoplado da URL pública.
**Libraries:** —

### phase-03-videos/TD-06

**Recommendation:** ID aleatório curto em base62 (11 caracteres) gerado com `node:crypto`, unique constraint no banco e retry em colisão (mesmo padrão do nickname da Fase 02). Sem dependência nova e sem o problema ESM-only do nanoid v5.
**Libraries:** —

### phase-03-videos/TD-07

**Recommendation:** URL GET assinada emitida pela API com TTL curto, servida direto pelo storage (`Range`/206 nativo; `response-content-disposition` para download com nome de arquivo). Segue `docs/diagrams/software-arch.mermaid`; API fora do fluxo de bytes. Risco do bearer temporário aceito nesta fase; visibilidade é Fase 04.
**Libraries:** @aws-sdk/s3-request-presigner

### phase-03-videos/TD-08

**Recommendation:** Ciclo do enunciado `rascunho → processando → pronto|erro`, com retries internos ao estado `processando` (backoff do BullMQ); `erro` só após esgotar tentativas, com `error_reason` e número de tentativas gravados. Uploads abandonados em `rascunho` são tratados pelo lifecycle do TD-02.
**Libraries:** —

### phase-03-videos/TD-09

**Recommendation:** Validação em três pontos: (1) na criação do upload, a API exige `fileSize` e `contentType` declarados e rejeita (400) acima de 10GiB ou fora da lista de contêineres de vídeo permitidos; (2) na finalização, soma o `Size` de `ListParts` e, se exceder o limite ou divergir do declarado, executa `AbortMultipartUpload`; (3) o worker valida com `ffprobe` que há stream de vídeo, senão marca `erro` com `error_reason` de mídia inválida, sem retry. Definir na implementação: lista de `contentType` e o `error_reason`.
**Libraries:** —

### openapi-docs-nestjs/TD-01

**Recommendation:** `@nestjs/swagger` with CLI plugin (`classValidatorShim: true`), reusing `class-validator` decorators.
**Libraries:** @nestjs/swagger

### openapi-docs-nestjs/TD-02

**Recommendation:** Runtime Swagger UI plus exported `openapi.json` (npm script), committed as the contract artifact.
**Libraries:** —

### openapi-docs-nestjs/TD-03

**Recommendation:** Swagger UI exposed only in dev/staging, via env flag.
**Libraries:** —

### next-frontend-openapi-typing/TD-01

**Recommendation:** `openapi-typescript` + `openapi-fetch` (types-first; strict BFF). _(frontend, out of scope for this phase)_
**Libraries:** openapi-typescript, openapi-fetch

### next-frontend-openapi-typing/TD-02

**Recommendation:** Committed local copy at `next-frontend/openapi.json` + repo-root sync script. _(frontend)_
**Libraries:** —

### next-frontend-openapi-typing/TD-03

**Recommendation:** Codegen output committed + CI freshness check covering `openapi.json` and `types.gen.ts`. _(frontend)_
**Libraries:** —

### next-frontend-openapi-typing/TD-04

**Recommendation:** Single `lib/api/contracts.ts` with explicit type aliases shared by BFF and Components. _(frontend)_
**Libraries:** —

### next-frontend-openapi-typing/TD-05

**Recommendation:** Hand-written MSW handlers typed via the generated `paths`. _(frontend)_
**Libraries:** —

### next-frontend-config-base/TD-01

**Recommendation:** Zod 4 for the frontend env schema. _(frontend)_
**Libraries:** zod

### next-frontend-config-base/TD-02

**Recommendation:** `@t3-oss/env-nextjs` for server/client boundary enforcement. _(frontend)_
**Libraries:** @t3-oss/env-nextjs

### next-frontend-config-base/TD-03

**Recommendation:** Strict BFF with a single server-only `API_URL`. _(frontend)_
**Libraries:** —

### next-frontend-msw-foundation/TD-01

**Recommendation:** MSW handlers per-domain modules under `mocks/handlers/<domain>.ts` plus barrel. _(frontend)_
**Libraries:** —

### next-frontend-msw-foundation/TD-02

**Recommendation:** Test-only `setupServer` at foundation; browser worker deferred. _(frontend)_
**Libraries:** —

### next-frontend-msw-foundation/TD-03

**Recommendation:** Hand-written deterministic defaults plus opt-in seeded faker for bulk collections only. _(frontend)_
**Libraries:** —

### next-frontend-msw-foundation/TD-04

**Recommendation:** Universal handler set in `setupServer` with per-test `server.use(...)` overrides and `onUnhandledRequest: "error"`. _(frontend)_
**Libraries:** —

## Inherited Conventions

- Backend config uses `@nestjs/config` with namespaced `registerAs(name, () => ({...}))` factories — one file per domain in `src/config/`. _(from phase 01)_
- Env variables are validated by a Joi schema in `src/config/env.validation.ts`, passed to `ConfigModule.forRoot({ validationSchema, validationOptions: { allowUnknown: true, abortEarly: false } })`. _(from phase 01)_
- Config is injected into modules via `ConfigType<typeof xxxConfig>` and `@Inject(xxxConfig.KEY)`; the same factory is importable as a plain function for non-DI contexts (e.g., TypeORM CLI). _(from phase 01)_
- `data-source.ts` loads `.env` via `import 'dotenv/config'` at the top, then imports `databaseConfig` and calls it as a plain function. _(from phase 01)_
- Database connection parameters are sourced from a single `databaseConfig` factory — never duplicated between `AppModule` and `data-source.ts`. _(from phase 01)_
- `TypeOrmModule.forRootAsync` is used (not `forRoot`), with `autoLoadEntities: true`, `synchronize: false`. _(from phase 01)_
- Domain errors use `DomainException` + `DomainExceptionFilter` with `{ statusCode, error, message }`. _(from phase 02)_
- Global JWT guard with `@Public()` opt-out; global `ValidationPipe`; `@nestjs/throttler` for rate limiting. _(from phase 02)_
- Schema changes via versioned TypeORM migrations; Docker Compose service names as hosts (never `localhost`). _(from phase 02)_

## Inherited Deferred Capabilities

| Capability | Status | Origin phase | Rationale |
|-----------|--------|--------------|-----------|
| Telas de frontend | deferred | phase-01-configuracao-base | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| Telas de cadastro, login, confirmação de conta e recuperação de senha | deferred | phase-02-auth | `next-frontend/` is not initialized in this phase; UI surfaces start in a later phase. |
| "Confirmação de conta via e-mail com link de ativação" | deferred | phase-02-auth-frontend | deferred_to_next_phase — UI landing screen de-scoped 2026-05-14; FE confirmation flow (TD-07) picked up by a future phase. BE side unchanged in `phase-02-auth`. |
| "Logout" | deferred | phase-02-auth-frontend | deferred_to_next_phase — logout button lives inside authenticated chrome (typically Phase 04). Phase 02 still implements POST `/api/auth/logout` (BFF route handler + `session.destroy()`) so the contract is ready when the chrome lands. |
| "Recuperação de senha (destination screen / set-new-password)" | deferred | phase-02-auth-frontend | deferred_to_next_phase — `/forgot-password` ships this phase sending the e-mail; the reset-password destination screen is absent from Figma → link destination remains a 404 until a later phase delivers the screen via `/screen-inventory` extension run. Documented as a known gap. |
| "Telas de cadastro, login, confirmação de conta e recuperação de senha" | deferred | phase-02-auth-frontend | a tela de confirmação da conta não será implementada nesta fase corrente, será adiada — the umbrella bullet's full coverage requires the confirmação and reset-password destination screens; both are deferred per Non-UI rows above. The 3 ship-this-phase telas (signup, login, forgot-password) are inventoried and covered by their own verbs; the umbrella bullet itself is deferred to the phase that lands the missing screens. |
| Interface de vídeo (upload, player, download no `next-frontend/`) | deferred | phase-03-videos | Fora do escopo da Fase 03 (enunciado do desafio): entrega é API, worker e infraestrutura. |

## UI Inventory

_No screen inventory — UI↔API sync deferred. Run /screen-inventory 04 and then rerun /plan-context <arg> to activate UI checks._

## Non-UI / Deferred Capabilities

_None._

## Testing Requirements

### nestjs-project

Source: `testing-guide-nestjs-project` Skill, "Feature Implementation Checklist".

| Artifact type | Required layers |
|---------------|-----------------|
| Entity (`*.entity.ts`) | Integration: constraints, defaults, `select: false` |
| Service with branching + DB | Unit (mock repo) + Integration (DB contract) |
| Service with DB only (no branching) | Integration: DB contract |
| Service with configured lib (JWT, cache) | Unit: real lib with test config |
| Service with side-effect dep (email, storage) | Integration: real capture service (Mailpit) or local adapter |
| Module with configured imports | Unit: compilation test |
| Controller | E2E only — no unit tests |
| DTO | E2E: one validation wiring test per endpoint |
| Guard (delegates to service) | E2E + Unit if complex internal logic |
| Pipe | Unit |
| Interceptor | Unit and/or E2E |
| Exception Filter | Unit + E2E |
| Middleware | E2E |

### next-frontend

_Deferred subproject — not in scope for this phase._
