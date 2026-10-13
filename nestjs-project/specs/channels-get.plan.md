---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.12
target_file: nestjs-project/test/channels-get.e2e-spec.ts
---

# GET /channels/:nickname Test Plan

## Application Overview

Informações públicas do canal e contagem de vídeos públicos.

## Test Scenarios

### 1. Página pública do canal

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar um usuário com canal e inserir vídeos publicados públicos, `unlisted`, não publicados e em processamento.

#### 1.1. get-public-channel

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname sem Authorization
    - expect: status 200
    - expect: `nickname`, `name`, `description`, `createdAt` e `videoCount`

#### 1.2. video-count-only-published-public

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/:nickname com vídeos nos quatro estados
    - expect: `videoCount` conta só os `pronto`, publicados e `public`

#### 1.3. unknown-channel

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /channels/inexistente
    - expect: status 404
    - expect: `error: "CHANNEL_NOT_FOUND"`
