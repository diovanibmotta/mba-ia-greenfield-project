---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.7
target_file: nestjs-project/test/videos-publish.e2e-spec.ts
---

# POST /videos/:publicId/publish Test Plan

## Application Overview

Publicação do vídeo pronto, com visibilidade opcional.

## Test Scenarios

### 1. Publicação

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar dois usuários com canal (dono e outro) e obter os access tokens, inserir vídeos do dono nos estados necessários e uma categoria existente.

#### 1.1. publish-ready-video

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish pelo dono de um vídeo `pronto` com categoria
    - expect: status 200
    - expect: `publicationState: "published"`
    - expect: `publishedAt` preenchido

#### 1.2. publish-as-unlisted

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish com `{ visibility: "unlisted" }`
    - expect: status 200
    - expect: `visibility: "unlisted"`

#### 1.3. access-before-and-after-publish

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /videos/:publicId anônimo antes de publicar
  2. POST publish pelo dono
  3. GET /videos/:publicId anônimo depois
    - expect: antes: status 404
    - expect: depois: status 200

#### 1.4. reject-missing-category

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish em um vídeo sem categoria
    - expect: status 400
    - expect: `error: "CATEGORY_REQUIRED"`

#### 1.5. reject-not-ready

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish em um vídeo `processando`
    - expect: status 409
    - expect: `error: "VIDEO_NOT_READY"`

#### 1.6. reject-already-published

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish em um vídeo já publicado
    - expect: status 409
    - expect: `error: "VIDEO_ALREADY_PUBLISHED"`

#### 1.7. reject-invalid-visibility

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish com `{ visibility: "private" }`
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.8. hide-video-from-non-owner

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.9. reject-unauthenticated

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. POST /videos/:publicId/publish sem header Authorization
    - expect: status 401
