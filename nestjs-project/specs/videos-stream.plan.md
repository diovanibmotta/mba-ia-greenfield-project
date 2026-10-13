---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.13
target_file: nestjs-project/test/videos-stream.e2e-spec.ts
---

# GET /videos/:publicId/stream Test Plan

## Application Overview

Emite a URL assinada para reprodução em streaming direto do storage.

## Test Scenarios

### 1. URL de streaming

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), criar dono e token, inserir um vídeo `pronto` com objeto real no MinIO e um vídeo `processando`; MinIO de teste ativo.

#### 1.1. anonymous-gets-stream-url

**Covers AC:** #1, #2
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/stream de um vídeo `pronto` sem Authorization
  2. GET na `url` retornada com header `Range: bytes=0-99`
    - expect: status 200 com `url` e `expiresIn`
    - expect: segunda requisição responde 206 com 100 bytes

#### 1.2. owner-gets-not-ready

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/stream de um vídeo `processando` pelo dono
    - expect: status 409
    - expect: `error: "VIDEO_NOT_READY"`

#### 1.3. anonymous-cannot-stream-processing-video

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/:publicId/stream de um vídeo `processando` sem Authorization
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.4. unknown-video

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. GET /videos/ZZZZZZZZZZZ/stream (inexistente)
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`
