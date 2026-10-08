---
kind: phase
name: phase-03-videos
sources_mtime:
  docs/project-plan.md: "2026-10-05T06:41:42-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-08T07:44:04-03:00"
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

# phase-03-videos — Context

## Scope

**Phase name:** Upload e Processamento de Vídeos
**Capabilities** (literal, `docs/project-plan.md`):

- Serviço de armazenamento de arquivos (vídeos e thumbnails)
- Serviço de processamento em segundo plano (filas)
- Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance
- Pré-cadastro automático do vídeo como rascunho ao iniciar o upload
- Processamento automático do vídeo após upload (extração de duração e metadados)
- Geração automática de thumbnail a partir de um frame do vídeo
- URL única por vídeo, sem conflito com outros vídeos
- Reprodução via streaming (sem necessidade de download completo)
- Download do vídeo pelo usuário

**Out of scope:** _Not specified._
**Deliverables:** upload de até 10GB funcional, processamento automático do vídeo, streaming funcionando, URLs únicas geradas.
**Affected subprojects:** `nestjs-project/` (backend). `next-frontend/` não é afetado: a interface de vídeo está fora do escopo da fase (enunciado do desafio).
**Deferred subprojects:** `next-frontend/` (UI de vídeo).
**Sequencing notes:** Depende de: Fase 01, Fase 02. Intro: "Upload de arquivos grandes sem travar o sistema, processamento automático do vídeo e geração de URL única."

**Neighbors (for boundary detection only):**

- **Phase 02:** Fluxo completo de criação de conta, confirmação por e-mail, login, logout e recuperação de senha. (Cadastro, Login e Gerenciamento de Conta)
- **Phase 04:** Gerenciamento de Vídeos e Canal (depende de Fase 02, Fase 03)

## Decisions Index

| Ref | Source | Scope | Topic | Status | Decision | Libraries |
|-----|--------|-------|-------|--------|----------|-----------|
| phase-03-videos/TD-01 | phase | Backend | Fila de processamento (tecnologia de fila) | pending | — | — |
| phase-03-videos/TD-02 | phase | Cross-layer | Estratégia de upload de arquivos de até 10GB | pending | — | — |
| phase-03-videos/TD-03 | phase | Backend | Runtime do worker e extração de metadados | pending | — | — |
| phase-03-videos/TD-04 | phase | Backend | Política de geração de thumbnail | pending | — | — |
| phase-03-videos/TD-05 | phase | Backend | Convenção de chaves e buckets no object storage | pending | — | — |
| phase-03-videos/TD-06 | phase | Backend | Identificador de URL única por vídeo | pending | — | — |
| phase-03-videos/TD-07 | phase | Cross-layer | Estratégia de streaming e download | pending | — | — |
| phase-03-videos/TD-08 | phase | Backend | Ciclo de status do vídeo e tratamento de falha | pending | — | — |
| phase-03-videos/TD-09 | phase | Backend | Validação do arquivo enviado e aplicação do limite de 10GB | pending | — | — |

_Source files:_

- phase-03-videos — `docs/decisions/technical-decisions-phase-03-videos.md` (scope_type: phase)

## Capability Coverage

| Capability (from project-plan.md) | Covered by |
|-----------------------------------|------------|
| Serviço de armazenamento de arquivos (vídeos e thumbnails) | phase-03-videos/TD-05 |
| Serviço de processamento em segundo plano (filas) | phase-03-videos/TD-01 |
| Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance | phase-03-videos/TD-02, phase-03-videos/TD-09 |
| Pré-cadastro automático do vídeo como rascunho ao iniciar o upload | phase-03-videos/TD-08 |
| Processamento automático do vídeo após upload (extração de duração e metadados) | phase-03-videos/TD-03, phase-03-videos/TD-08, phase-03-videos/TD-09 |
| Geração automática de thumbnail a partir de um frame do vídeo | phase-03-videos/TD-04 |
| URL única por vídeo, sem conflito com outros vídeos | phase-03-videos/TD-06 |
| Reprodução via streaming (sem necessidade de download completo) | phase-03-videos/TD-07 |
| Download do vídeo pelo usuário | phase-03-videos/TD-07 |

## Decisions Detail

_No current-scope TDs decided yet (all 9 TDs of phase-03-videos are `pending`; `/plan-resolve` fills them)._

## Inherited Decisions Detail

### phase-01-configuracao-base/TD-01

**Recommendation:** `@nestjs/config`, official and compatible with NestJS 11; the `registerAs()` factory is both a DI token and a plain importable function.
**Libraries:** @nestjs/config

### phase-01-configuracao-base/TD-02

**Recommendation:** Joi via `validationSchema` of `@nestjs/config`, zero custom wiring, native string-to-number coercion.
**Libraries:** joi

### phase-01-configuracao-base/TD-03

**Recommendation:** Namespaced configs with `registerAs`, one file per domain, typed injection via `ConfigType<typeof xxxConfig>`. Roadmap calls for auth, email and storage in later phases.
**Libraries:** —

### phase-01-configuracao-base/TD-04

**Recommendation:** Shared `registerAs` factory: `data-source.ts` imports it, calls `dotenv.config()`, then calls the factory. Zero duplication.
**Libraries:** —

### phase-02-auth/TD-01

**Recommendation:** Argon2id (OWASP minimum 19MiB memory, 2 iterations).
**Libraries:** argon2

### phase-02-auth/TD-02

**Recommendation:** Custom guards with `@nestjs/jwt` only (decided B; no Passport).
**Libraries:** @nestjs/jwt

### phase-02-auth/TD-03

**Recommendation:** Refresh token rotation with DB persistence; short grace period mitigates races.
**Libraries:** —

### phase-02-auth/TD-04

**Recommendation:** Random opaque tokens in DB for email confirmation and password reset (revocable).
**Libraries:** —

### phase-02-auth/TD-05

**Recommendation:** `@nestjs-modules/mailer` over SMTP, Handlebars templates, Mailpit in local development.
**Libraries:** @nestjs-modules/mailer

### phase-02-auth/TD-06

**Recommendation:** `class-validator` + `class-transformer` for request validation (documented NestJS approach).
**Libraries:** class-validator, class-transformer

### phase-02-auth/TD-07

**Recommendation:** Custom domain exception filter returning `{ statusCode, error, message }` with machine-readable domain codes.
**Libraries:** —

### phase-02-auth/TD-08

**Recommendation:** `@nestjs/throttler`, in-memory storage, scoped via module-level `APP_GUARD`, `@SkipThrottle()` for exemptions.
**Libraries:** @nestjs/throttler

### phase-02-auth/TD-09

**Recommendation:** Refresh token format decided as JWT (A) for consistency with the access token, using `@nestjs/jwt` (payload `userId`, `tokenFamily`).
**Libraries:** @nestjs/jwt

### phase-02-auth/TD-10

**Recommendation:** Nickname `[a-z0-9_]` allowlist with `user_<8-char-random>` fallback when the email prefix yields an empty string; collision handled by unique constraint with retry.
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

_No inherited deferred capabilities._

## Non-UI / Deferred Capabilities

| Capability | Status | Rationale | TD refs |
|------------|--------|-----------|---------|
| Interface de vídeo (upload, player, download no `next-frontend/`) | deferred | Fora do escopo da Fase 03 (enunciado do desafio): entrega é API, worker e infraestrutura. | — |

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
