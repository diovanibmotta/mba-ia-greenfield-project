---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.9
target_file: nestjs-project/test/me-channel-get.e2e-spec.ts
---

# GET /me/channel Test Plan

## Application Overview

Canal do usuário autenticado.

## Test Scenarios

### 1. Consulta do próprio canal

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler e criar um usuário com canal e o access token.

#### 1.1. get-my-channel

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/channel com token válido
    - expect: status 200
    - expect: `id`, `nickname`, `name`, `description` e `createdAt` do canal do usuário

#### 1.2. channel-without-description

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/channel de um canal recém-criado
    - expect: status 200
    - expect: `description: null`

#### 1.3. reject-unauthenticated

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/channel sem header Authorization
    - expect: status 401
