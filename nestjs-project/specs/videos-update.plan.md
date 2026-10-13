---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.6
target_file: nestjs-project/test/videos-update.e2e-spec.ts
---

# PATCH /videos/:publicId Test Plan

## Application Overview

Edição de título, descrição, categoria e visibilidade pelo dono.

## Test Scenarios

### 1. Edição do vídeo

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler, criar dois usuários com canal (dono e outro) e obter os access tokens e inserir um vídeo `pronto` do dono; categorias vindas do seed.

#### 1.1. update-title

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `{ title: "Novo título" }` pelo dono
    - expect: status 200
    - expect: `title: "Novo título"`

#### 1.2. clear-description

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `{ description: null }` pelo dono
    - expect: status 200
    - expect: `description: null`

#### 1.3. set-category

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `categoryId` de uma categoria existente
    - expect: status 200
    - expect: `category` preenchida com `id`, `slug` e `name`

#### 1.4. reject-unknown-category

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `categoryId` inexistente
    - expect: status 404
    - expect: `error: "CATEGORY_NOT_FOUND"`

#### 1.5. set-visibility

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `{ visibility: "unlisted" }`
    - expect: status 200
    - expect: `visibility: "unlisted"`

#### 1.6. reject-upload-in-progress

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId em um vídeo `rascunho` com upload aberto
    - expect: status 409
    - expect: `error: "VIDEO_UPLOAD_IN_PROGRESS"`

#### 1.7. hide-video-from-non-owner

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com o token de outro usuário
    - expect: status 404
    - expect: `error: "VIDEO_NOT_FOUND"`

#### 1.8. reject-empty-body-or-title

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId com `{}`
  2. PATCH /videos/:publicId com `{ title: "" }`
    - expect: status 400 e `error: "VALIDATION_ERROR"` em ambas

#### 1.9. reject-unauthenticated

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /videos/:publicId sem header Authorization
    - expect: status 401
