---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.8
target_file: nestjs-project/test/videos-thumbnail.e2e-spec.ts
---

# PUT /videos/:publicId/thumbnail Test Plan

## Application Overview

Troca da thumbnail por uma imagem validada e normalizada na API.

## Test Scenarios

### 1. Thumbnail customizada

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar dois usuários com canal (dono e outro) e obter os access tokens, inserir um vídeo `pronto` do dono e gerar imagens de teste (PNG 2000×1500, arquivo de texto, arquivo acima de 2 MiB); MinIO de teste ativo.

#### 1.1. replace-thumbnail-with-png

**Covers AC:** #1, #2, #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail (multipart, campo `file`) com um PNG de 2000×1500 pelo dono
  2. GET na `thumbnailUrl` retornada
  3. GET /videos/:publicId pelo dono
    - expect: status 200 com `thumbnailUrl`
    - expect: a URL responde `Content-Type: image/jpeg` com no máximo 1280×720
    - expect: `thumbnail_key` do vídeo é `videos/{id}/thumbnail-custom.jpg` e o GET devolve a nova `thumbnailUrl`

#### 1.2. reject-non-image

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail com um arquivo de texto
    - expect: status 400
    - expect: `error: "INVALID_THUMBNAIL"`

#### 1.3. reject-missing-file

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail sem o campo `file`
    - expect: status 400
    - expect: `error: "INVALID_THUMBNAIL"`

#### 1.4. reject-too-large

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail com arquivo acima de 2 MiB
    - expect: status 413
    - expect: `error: "THUMBNAIL_TOO_LARGE"`

#### 1.5. hide-video-from-non-owner

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.6. reject-upload-in-progress

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail em um vídeo `rascunho` com upload aberto
    - expect: status 409
    - expect: `error: "VIDEO_UPLOAD_IN_PROGRESS"`

#### 1.7. reject-unauthenticated

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PUT /videos/:publicId/thumbnail sem header Authorization
    - expect: status 401
