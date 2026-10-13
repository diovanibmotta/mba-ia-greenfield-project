---
subproject: backend
runner: jest+supertest
scope: phase-04-gerenciamento
si: SI-04.4
target_file: nestjs-project/test/categories-list.e2e-spec.ts
---

# GET /categories Test Plan

## Application Overview

Lista pública das categorias de vídeo semeadas pela migration.

## Test Scenarios

### 1. Listagem de categorias

**Setup:** truncar o banco de testes, subir o módulo da aplicação com `main.ts` reproduzido (ValidationPipe e filtros globais), limpar o contador do throttler; as 8 categorias vêm do seed da migration.

#### 1.1. list-categories-anonymous

**Covers AC:** #1, #2, #3
**Source:** auto
**Last sync:** 2026-10-13T17:22:34Z

**Steps:**
  1. GET /categories sem header Authorization
    - expect: status 200 com `items` de 8 categorias
    - expect: ordem: Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros
    - expect: cada item com `id` (uuid), `slug` e `name`
