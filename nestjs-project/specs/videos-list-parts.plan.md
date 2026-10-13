---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.6
target_file: nestjs-project/test/videos-list-parts.e2e-spec.ts
---

# GET /videos/:publicId/upload/parts Test Plan

## Application Overview

Lista as partes já enviadas para retomar um upload interrompido.

## Test Scenarios

### 1. Listagem de partes

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dois usuários, obter tokens e criar um rascunho; MinIO de teste ativo.

#### 1.1. list-parts-empty

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/upload/parts pelo dono logo após `POST /videos`
    - expect: status 200
    - expect: `parts: []`

#### 1.2. list-uploaded-parts

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Obter URLs das partes 1 e 2 e enviar os bytes de cada parte
  2. GET /videos/:publicId/upload/parts pelo dono
    - expect: status 200 com duas entradas
    - expect: cada entrada com `partNumber`, `size` e `eTag`

#### 1.3. hide-video-from-non-owner

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET parts com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.4. reject-non-draft-state

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Mover o vídeo para `processando` direto no banco
  2. GET parts pelo dono
    - expect: status 409
    - expect: `error: "INVALID_UPLOAD_STATE"`

#### 1.5. reject-unauthenticated

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET parts sem header Authorization
    - expect: status 401
