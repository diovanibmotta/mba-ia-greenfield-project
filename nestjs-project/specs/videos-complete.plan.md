---
subproject: backend
runner: jest+supertest
scope: phase-03-videos
si: SI-03.7
target_file: nestjs-project/test/videos-complete.e2e-spec.ts
---

# POST /videos/:publicId/upload/complete Test Plan

## Application Overview

Finaliza o multipart, valida o tamanho real e enfileira o processamento.

## Test Scenarios

### 1. Finalização do upload

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar a fila `video-processing`, criar dois usuários, obter tokens e criar um rascunho com partes enviadas; MinIO e Redis de teste ativos.

#### 1.1. complete-upload-and-enqueue

**Covers AC:** #1, #2, #3
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Enviar todas as partes, com soma igual ao `fileSize` declarado
  2. POST /videos/:publicId/upload/complete pelo dono com as partes e `eTag`s
    - expect: status 202 com `status: "processando"`
    - expect: linha do vídeo com `size_bytes` igual à soma das partes, `status = processando` e `upload_id` nulo
    - expect: fila `video-processing` com job `video.process` `{ videoId }` e `attempts` igual a `VIDEO_PROCESSING_ATTEMPTS`

#### 1.2. reject-size-mismatch

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Enviar partes cuja soma difere do `fileSize` declarado
  2. POST complete pelo dono
    - expect: status 400
    - expect: `error: "UPLOAD_SIZE_MISMATCH"`
    - expect: multipart deixa de existir no storage

#### 1.3. reject-file-too-large

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Configurar `VIDEO_MAX_SIZE_BYTES` baixo no módulo de teste
  2. Enviar partes acima do limite configurado
  3. POST complete pelo dono
    - expect: status 400
    - expect: `error: "FILE_TOO_LARGE"`
    - expect: multipart abortado

#### 1.4. reject-invalid-part-list

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST complete com `eTag` divergente do armazenado
    - expect: status 400
    - expect: `error: "INVALID_PART_LIST"`

#### 1.5. hide-video-from-non-owner

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. POST complete com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.6. reject-already-processing

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-08T11:41:08Z

**Steps:**
  1. Completar o upload com sucesso
  2. POST complete novamente pelo dono
    - expect: status 409
    - expect: `error: "INVALID_UPLOAD_STATE"`
