---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.13
target_file: nestjs-project/test/channels-videos.e2e-spec.ts
---

# GET /channels/:nickname/videos Test Plan

## Application Overview

Listagem pública do canal com cursor, sem vídeos unlisted ou não publicados.

## Test Scenarios

### 1. Listagem pública

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar um usuário com canal e inserir cinco vídeos publicados públicos (com `published_at` distintos) mais vídeos `unlisted` e não publicados.

#### 1.1. list-published-public-only

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname/videos sem Authorization
    - expect: status 200 só com vídeos `pronto`, publicados e `public`
    - expect: ordem por `publishedAt` decrescente; cada item com `id`, `title`, `thumbnailUrl`, `durationSeconds`, `publishedAt` e `viewCount`

#### 1.2. paginate-with-cursor

**Covers AC:** #3, #4, #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname/videos?limit=2
  2. repetir com o `nextCursor` até o fim
    - expect: primeira página: 2 itens e `nextCursor`
    - expect: nenhum item repetido entre páginas
    - expect: última página com `nextCursor: null`

#### 1.3. reject-invalid-cursor

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname/videos?cursor=invalido
    - expect: status 400
    - expect: `error: "INVALID_CURSOR"`

#### 1.4. reject-invalid-limit

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname/videos?limit=51
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.5. unknown-channel

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/inexistente/videos
    - expect: status 404
    - expect: `error: "CHANNEL_NOT_FOUND"`
