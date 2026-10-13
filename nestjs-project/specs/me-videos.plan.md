---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.11
target_file: nestjs-project/test/me-videos.e2e-spec.ts
---

# GET /me/videos Test Plan

## Application Overview

Painel de gerenciamento do dono com paginação por offset, ordenação e filtro.

## Test Scenarios

### 1. Painel do canal

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar dois usuários com canal e inserir vídeos direto no banco em estados e contadores variados.

#### 1.1. list-defaults

**Covers AC:** #1, #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos com token válido, sem parâmetros
    - expect: status 200 com `items`, `page: 1`, `pageSize: 20` e `total`
    - expect: itens por `createdAt` decrescente

#### 1.2. only-own-videos

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos com vídeos de dois canais no banco
    - expect: apenas vídeos do canal do token

#### 1.3. sort-by-view-count

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos?sort=viewCount&order=asc
    - expect: itens em ordem crescente de `viewCount`

#### 1.4. paginate

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. Com cinco vídeos, GET /me/videos?pageSize=2&page=2
    - expect: 2 itens
    - expect: `total: 5`

#### 1.5. filter-unpublished

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos?publicationState=unpublished
    - expect: apenas vídeos `pronto` sem `published_at`

#### 1.6. item-fields

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos
    - expect: cada item com `status`, `publicationState`, `visibility`, `publishedAt` e os quatro contadores

#### 1.7. reject-invalid-params

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos?pageSize=101
  2. GET /me/videos?sort=invalido
    - expect: status 400 e `error: "VALIDATION_ERROR"` em ambas

#### 1.8. reject-unauthenticated

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /me/videos sem header Authorization
    - expect: status 401
