---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.14
target_file: nestjs-project/test/videos-download.e2e-spec.ts
---

# GET /videos/:publicId/download Test Plan

## Application Overview

Emite a URL assinada para download com Content-Disposition attachment.

## Test Scenarios

### 1. URL de download

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dono e token, inserir um vídeo `pronto` com objeto real no MinIO e um vídeo `processando`; MinIO de teste ativo.

#### 1.1. anonymous-gets-download-url

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/download de um vídeo `pronto` sem Authorization
  2. GET na `url` retornada
    - expect: status 200 com `url` e `expiresIn`
    - expect: segunda requisição com header `Content-Disposition: attachment; filename="<file_name>"` e corpo com `size_bytes` bytes

#### 1.2. owner-gets-not-ready

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/download de um vídeo `processando` pelo dono
    - expect: status 409
    - expect: `error: "VIDEO_NOT_READY"`

#### 1.3. anonymous-cannot-download-processing-video

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/download de um vídeo `processando` sem Authorization
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`
