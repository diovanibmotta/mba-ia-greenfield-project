---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.5
target_file: nestjs-project/test/videos-part-urls.e2e-spec.ts
---

# POST /videos/:publicId/upload/part-urls Test Plan

## Application Overview

Emite URLs assinadas para envio de partes direto ao storage.

## Test Scenarios

### 1. Emissão de URLs de parte

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dois usuários (dono e outro), obter tokens e criar um rascunho via `POST /videos`; MinIO de teste ativo.

#### 1.1. issue-part-urls-and-upload

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos/:publicId/upload/part-urls pelo dono com `{ partNumbers: [1, 2] }`
  2. PUT de bytes (parte 1 com pelo menos 5 MiB) na primeira URL retornada
    - expect: status 200 com duas URLs em `urls` e `expiresIn`
    - expect: PUT responde 200 com header `ETag`

#### 1.2. reject-invalid-part-number

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST part-urls com `partNumbers: [0]`
  2. POST part-urls com `partNumbers: [totalParts + 1]`
    - expect: status 400 e `error: "INVALID_PART_NUMBER"` em ambas

#### 1.3. hide-video-from-non-owner

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST part-urls com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.4. reject-non-draft-state

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Mover o vídeo para `processando` direto no banco
  2. POST part-urls pelo dono
    - expect: status 409
    - expect: `error: "INVALID_UPLOAD_STATE"`

#### 1.5. reject-too-many-items

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST part-urls com 101 itens em `partNumbers`
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.6. reject-unauthenticated

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST part-urls sem header Authorization
    - expect: status 401
