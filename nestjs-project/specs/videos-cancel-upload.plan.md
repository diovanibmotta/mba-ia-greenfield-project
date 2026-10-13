---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.8
target_file: nestjs-project/test/videos-cancel-upload.e2e-spec.ts
---

# DELETE /videos/:publicId/upload Test Plan

## Application Overview

Cancela o upload em andamento e descarta o rascunho.

## Test Scenarios

### 1. Cancelamento do upload

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dois usuários, obter tokens e criar um rascunho; MinIO de teste ativo.

#### 1.1. cancel-draft-upload

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. DELETE /videos/:publicId/upload pelo dono de um rascunho
    - expect: status 204
    - expect: linha do vídeo removida de `videos`
    - expect: multipart deixa de existir no storage

#### 1.2. hide-video-from-non-owner

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. DELETE com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.3. reject-processing-state

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Mover o vídeo para `processando` direto no banco
  2. DELETE pelo dono
    - expect: status 409
    - expect: `error: "INVALID_UPLOAD_STATE"`

#### 1.4. reject-unauthenticated

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. DELETE sem header Authorization
    - expect: status 401
