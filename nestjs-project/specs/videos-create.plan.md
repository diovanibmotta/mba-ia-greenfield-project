---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.4
target_file: nestjs-project/test/videos-create.e2e-spec.ts
---

# POST /videos Test Plan

## Application Overview

Cria o rascunho do vídeo e abre o multipart upload no storage ao iniciar o upload.

## Test Scenarios

### 1. Criação do upload

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), registrar e confirmar um usuário e obter o access token; MinIO de teste ativo.

#### 1.1. create-draft-happy-path

**Covers AC:** #1, #7
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos com token válido e `{ fileName: "aula.mp4", fileSize: 1073741824, contentType: "video/mp4" }`
    - expect: status 201
    - expect: `id` com 11 caracteres, `status: "rascunho"`, `title: "aula"`, `partSize: 16777216`, `totalParts: 64`
    - expect: linha em `videos` com `upload_id` preenchido e `storage_key = videos/{id}/original.mp4`
    - expect: multipart upload aberto no storage para a chave

#### 1.2. create-draft-keeps-title

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos com `title: "Minha aula"` além dos campos obrigatórios
    - expect: status 201
    - expect: `title: "Minha aula"`

#### 1.3. reject-file-too-large

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos com `fileSize: 10737418241`
    - expect: status 400
    - expect: `error: "FILE_TOO_LARGE"`

#### 1.4. reject-unsupported-media-type

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos com `contentType: "application/pdf"`
    - expect: status 400
    - expect: `error: "UNSUPPORTED_MEDIA_TYPE"`

#### 1.5. reject-invalid-body

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos sem `fileName`
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.6. reject-unauthenticated

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST /videos sem header Authorization
    - expect: status 401
