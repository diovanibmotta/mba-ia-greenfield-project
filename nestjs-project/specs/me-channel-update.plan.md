---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.10
target_file: nestjs-project/test/me-channel-update.e2e-spec.ts
---

# PATCH /me/channel Test Plan

## Application Overview

Edição de nickname, nome e descrição do próprio canal.

## Test Scenarios

### 1. Edição do canal

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler e criar dois usuários com canal e seus tokens.

#### 1.1. update-name

**Covers AC:** #1
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com `{ name: "Meu canal" }`
    - expect: status 200
    - expect: `name: "Meu canal"`

#### 1.2. update-nickname

**Covers AC:** #2
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com um nickname livre
    - expect: status 200
    - expect: `nickname` igual ao novo valor

#### 1.3. old-nickname-is-released

**Covers AC:** #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel trocando o nickname do primeiro usuário
  2. PATCH /me/channel do segundo usuário assumindo o nickname antigo
    - expect: segundo PATCH: status 200

#### 1.4. reject-taken-nickname

**Covers AC:** #4
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com o nickname de outro canal
    - expect: status 409
    - expect: `error: "NICKNAME_ALREADY_EXISTS"`

#### 1.5. same-nickname-is-ok

**Covers AC:** #5
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com o próprio nickname atual
    - expect: status 200

#### 1.6. clear-description

**Covers AC:** #6
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com `{ description: "" }`
    - expect: status 200
    - expect: `description: null`

#### 1.7. reject-invalid-nickname

**Covers AC:** #7
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com `{ nickname: "Nick Name" }`
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.8. reject-empty-body

**Covers AC:** #8
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel com `{}`
    - expect: status 400
    - expect: `error: "VALIDATION_ERROR"`

#### 1.9. reject-unauthenticated

**Covers AC:** #9
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. PATCH /me/channel sem header Authorization
    - expect: status 401
