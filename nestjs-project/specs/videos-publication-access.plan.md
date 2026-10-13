---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.5
target_file: nestjs-project/test/videos-publication-access.e2e-spec.ts
---

# GET /videos/:publicId (regra de acesso por publicação) Test Plan

## Application Overview

Acesso ao vídeo, ao stream e ao download passa a depender da publicação (`pronto` + `published_at`), não só do status.

## Test Scenarios

### 1. Acesso por publicação

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar dois usuários com canal (dono e outro) e obter os access tokens e inserir vídeos direto no banco em cada combinação de status/`published_at`/`visibility`; MinIO de teste ativo.

#### 1.1. anonymous-reads-unlisted-published

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `pronto`, publicado e `unlisted`, sem Authorization
    - expect: status 200

#### 1.2. anonymous-cannot-read-unpublished-ready

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `pronto` com `published_at` nulo, sem Authorization
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.3. owner-reads-unpublished-ready

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `pronto` com `published_at` nulo, pelo dono
    - expect: status 200
    - expect: `publicationState: "unpublished"`

#### 1.4. response-includes-new-fields

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId de um vídeo recém-criado, pelo dono
    - expect: `description`, `visibility`, `publishedAt` e `category` presentes
    - expect: `viewCount`, `likeCount`, `dislikeCount` e `commentCount` iguais a 0

#### 1.5. publication-state-per-status

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId pelo dono para vídeos em `processando`, `erro`, `rascunho` e `pronto` publicado
    - expect: `publicationState` respectivamente "processing", "error", "uploading" e "published"

#### 1.6. anonymous-streams-unlisted-published

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId/stream de um vídeo publicado `unlisted`, sem Authorization
    - expect: status 200 com `url` e `expiresIn`

#### 1.7. stream-unpublished-ready

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId/stream de um vídeo `pronto` não publicado, sem Authorization
  2. GET /videos/:publicId/stream do mesmo vídeo pelo dono
    - expect: primeira chamada: status 404
    - expect: segunda chamada: status 200

#### 1.8. anonymous-cannot-download-unpublished

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId/download de um vídeo `pronto` não publicado, sem Authorization
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`
