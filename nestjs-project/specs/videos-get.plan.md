---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.12
target_file: nestjs-project/test/videos-get.e2e-spec.ts
---

# GET /videos/:publicId Test Plan

## Application Overview

Retorna os dados do vídeo respeitando a visibilidade por status.

## Test Scenarios

### 1. Consulta de vídeo

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dois usuários (dono e outro), obter tokens e inserir vídeos direto no banco em cada status (`rascunho`, `processando`, `pronto`, `erro`); MinIO de teste ativo.

#### 1.1. anonymous-reads-ready-video

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `pronto` sem Authorization
    - expect: status 200
    - expect: `status: "pronto"`, `durationSeconds` e `thumbnailUrl`

#### 1.2. anonymous-cannot-read-processing-video

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `processando` sem Authorization
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.3. owner-reads-processing-video

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `processando` pelo dono
    - expect: status 200
    - expect: `status: "processando"`

#### 1.4. owner-reads-error-reason

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `erro` pelo dono
    - expect: status 200
    - expect: `errorReason` preenchido

#### 1.5. other-user-cannot-read-draft

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um `rascunho` com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.6. unknown-video

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/ZZZZZZZZZZZ (inexistente)
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.7. invalid-bearer-treated-as-anonymous

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId de um vídeo `pronto` com bearer inválido
    - expect: status 200
