---
scope_type: phase
related_phases: [4]
status: decided
date: 2026-10-13
scope_description: "Fase 04 (backend) — categorias, edição de vídeo, visibilidade pública/unlisted, rascunho → publicação, painel do canal, edição do canal e página pública do canal"
---

# Technical Decisions — Phase 04: Gerenciamento de Vídeos e Canal (backend)

_Subprojects in scope:_

- `nestjs-project/` — backend: categorias, edição de vídeo e de canal, publicação/visibilidade, thumbnail customizada, listagens do painel e da página pública. Recebe TD-01 a TD-06.
- `next-frontend/` — sem TD de implementação nesta fase. Escopo da pesquisa definido pelo usuário em 2026-10-13: **somente backend**, como na Fase 03. TD-01, TD-03 e TD-04 são `Cross-layer` porque fixam o contrato (estados de publicação, upload de thumbnail e paginação) que a interface futura consumirá.

**Constraints herdados (não reabertos):** `@nestjs/config` + Joi; JWT com guard global, `@Public()` e `@OptionalAuth()` (Fases 02/03); `DomainException` + `DomainExceptionFilter` com `{ statusCode, error, message }`; `@nestjs/throttler`; OpenAPI com `openapi.json` exportado; PostgreSQL 17 + TypeORM com migrations versionadas; ciclo de status técnico `rascunho → processando → pronto | erro` (`phase-03-videos/TD-08`); chaves de storage `videos/{videoId}/…` por UUID interno (`phase-03-videos/TD-05`); `public_id` base62 de 11 caracteres como identificador de URL (`phase-03-videos/TD-06`); streaming/download por URL assinada (`phase-03-videos/TD-07`); nickname do canal `[a-z0-9_]`, único, derivado do e-mail (`phase-02-auth/TD-10`).

**Regra herdada que esta fase altera (não é TD):** na Fase 03, `GET /videos/:id`, `/stream` e `/download` tratam todo vídeo `pronto` como público (esclarecimento AMB-1 do `validation.md` da Fase 03, que já previa "visibilidade é Fase 04"). TD-01 define a regra que passa a valer; a implementação deve ajustar `VideosService.findVisibleVideo`.

**Versões instaladas relevantes (`nestjs-project/package.json`, Node 25.6):** `@nestjs/common` 11.1.16, `@nestjs/platform-express` 11.1.16 (traz `multer` 2.1.1), `typeorm` ^0.3.28, `class-validator` ^0.14.4.

**Evidências de pesquisa usadas nas recomendações:**
- Nest 11 documenta `FileInterceptor` com `limits.fileSize` do Multer e `ParseFilePipe` com `MaxFileSizeValidator`/`FileTypeValidator`; este último valida a assinatura do conteúdo (magic number) e não só o MIME informado ([docs.nestjs.com — file upload](https://docs.nestjs.com/techniques/file-upload)). O limite real de tamanho deve ficar no Multer, pois validadores só rodam depois de o arquivo ser aceito.
- `file-type` 22.x é ESM-only (`npm view file-type type` → `module`); o projeto compila em CommonJS, então depender dele diretamente repete o problema que já ocorreu com `@nestjs/bullmq` 12 e `nanoid` 5. `sharp` 0.35.x (Apache-2.0) é CommonJS-compatível, usa binários pré-compilados via Node-API ([sharp.pixelplumbing.com/install](https://sharp.pixelplumbing.com/install)); compatibilidade exata com Node 25 deve ser confirmada em `plan-resolve` instalando no container.
- Fontes sobre paginação por cursor (keyset) vs offset: comportamento padrão de PostgreSQL — `OFFSET` varre e descarta linhas, e inserções concorrentes deslocam páginas; keyset usa índice composto e é estável.

---

## TD-01: Modelo de publicação e visibilidade do vídeo

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Visibilidade do vídeo: público (aparece para todos) ou unlisted (somente via link)"; "Fluxo de rascunho → publicação"; "Edição de vídeos a partir do painel"; "Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)"

**Context:** Hoje `status = pronto` significa "processado" **e** "público". A Fase 04 separa as duas coisas: o dono edita título, descrição e categoria antes de publicar, escolhe se o vídeo é público ou unlisted e só então publica. O painel precisa mostrar "tempo de publicação" e "status". A decisão define o modelo de dados e a regra de acesso usada por `GET /videos/:id`, `/stream`, `/download`, pela página pública do canal e (Fases 05/07) por sugestões, home e busca. Afeta a interface, que precisa exibir e enviar esses estados.

**Options:**

### Option A: Publicação ortogonal ao status técnico (`published_at` + `visibility`)
- Mantém `status` como está (técnico). Adiciona `visibility` (enum `public | unlisted`, default `public`) e `published_at` (timestamp nulo). "Rascunho de publicação" = `published_at IS NULL`; publicado = `published_at` preenchido, exigindo `status = pronto`. Acesso por link: qualquer pessoa com o `public_id` quando publicado (public ou unlisted); listagens e buscas só incluem `visibility = public`.
- **Pros:** `published_at` já atende a coluna "tempo de publicação" do painel; não mexe no ciclo de processamento da Fase 03; a regra de listagem é um filtro simples e indexável.
- **Cons:** duas colunas para ler em conjunto (status técnico e publicação); a API precisa expor um estado derivado (ex.: `publicationState`) para a interface não reimplementar a regra.

### Option B: Estender o enum `status` com `publicado`
- Ciclo único: `rascunho → processando → pronto → publicado | erro`; `visibility` separada.
- **Pros:** um só campo de estado; consultas "publicados" por igualdade.
- **Cons:** mistura processamento e publicação num mesmo enum (o `rascunho` atual significa "upload em andamento", não "metadados em edição"); altera migration e testes da Fase 03; não registra quando publicou (precisa de coluna extra de qualquer forma).

### Option C: Um único enum `visibility` com `draft | unlisted | public`
- O rascunho passa a ser uma visibilidade; `status` continua técnico.
- **Pros:** uma coluna cobre rascunho e visibilidade; filtro de listagem é `visibility = 'public'`.
- **Cons:** perde o instante de publicação (coluna extra necessária); despublicar/voltar a rascunho confunde "estado" com "visibilidade"; o dono não consegue "publicar como unlisted" sem passar por um estado intermediário.

**Recommendation:** Option A — separa processamento de publicação sem reabrir os TDs da Fase 03 e entrega o "tempo de publicação" do painel de graça. Regras associadas à recomendação: publicar exige `status = pronto` (senão `409 VIDEO_NOT_READY`), título preenchido e categoria definida (a categoria sustenta as sugestões da Fase 05 e o filtro da Fase 07); edição de título, descrição, categoria, thumbnail e visibilidade é permitida em qualquer status exceto `rascunho` com upload aberto; vídeo `pronto` mas não publicado é visível só ao dono (regra atual de "não pronto"); despublicar fica fora da fase, pois o plano só descreve rascunho → publicação.

**Decision:** A (published_at + visibility, ortogonal ao status técnico)
**Revisions:**
- 2026-10-13 — Contrato do estado exposto ao painel definido: a API devolve `publicationState` ∈ {`uploading`, `processing`, `error`, `unpublished`, `published`}, derivado de `status`, `published_at` e `visibility` (`uploading` = `rascunho` técnico com upload aberto; `unpublished` = `pronto` sem `published_at`); `status`, `visibility` e `published_at` continuam expostos. Rótulos do painel: Enviando, Processando, Erro, Rascunho, Publicado (Público/Não listado). Rationale: o "rascunho" do bullet "Fluxo de rascunho → publicação" colidia com o `rascunho` técnico da Fase 03 (AMB-2).

---

## TD-02: Categorias de vídeo

**Scope:** Backend

**Capability:** Categorias de vídeo disponíveis na plataforma

**Context:** O vídeo passa a ter exatamente uma categoria, escolhida pelo dono na edição. Fases 05 (sugestões da mesma categoria) e 07 (filtro por categoria na home) leem essa relação. O plano diz "categorias disponíveis na plataforma" mas não define a lista nem quem a administra.

**Options:**

### Option A: Tabela `categories` semeada por migration, API somente leitura
- Tabela (`id`, `slug` único, `name`, `sort_order`) populada em migration de dados com uma lista inicial; `videos.category_id` com FK nula até a publicação. Endpoint público `GET /categories`.
- **Pros:** FK garante integridade; nome e ordem editáveis por nova migration sem mudar código; suporta joins para sugestões e filtro.
- **Cons:** alterar a lista exige migration (aceitável: não há administração no plano); uma tabela e um endpoint a mais.

### Option B: Enum no código (constante TypeScript) e coluna `varchar`/enum PostgreSQL
- Lista fixa em código; coluna guarda o valor.
- **Pros:** nenhuma tabela nova; validação trivial com `class-validator`.
- **Cons:** `ALTER TYPE` para mudar a lista no caso de enum PostgreSQL; nome para exibição e ordenação ficam hardcoded no backend e duplicados na interface.

### Option C: Categorias gerenciáveis (CRUD administrativo)
- Tabela com endpoints de criação/edição/remoção para um papel administrativo.
- **Pros:** flexível, sem deploy para ajustar categorias.
- **Cons:** o projeto não tem papel de administrador nem tela para isso; amplia a fase além dos bullets.

**Recommendation:** Option A — dá integridade referencial e leitura simples para as Fases 05/07 sem criar administração que o plano não pede. Lista inicial sugerida para a migration (a confirmar): Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros.

**Decision:** A (tabela categories semeada por migration, API somente leitura)
**Revisions:**
- 2026-10-13 — Lista inicial confirmada para o seed: Educação, Entretenimento, Esportes, Jogos, Música, Notícias, Tecnologia, Outros (slug em kebab-case sem acento; ordem alfabética com "Outros" por último). Rationale: a lista estava marcada como "a confirmar" na recomendação (AMB-1).

---

## TD-03: Upload da thumbnail customizada

**Scope:** Cross-layer

**Capability:** Edição das informações do vídeo: título, descrição, categoria e thumbnail customizada

**Context:** A thumbnail automática (Fase 03) é gerada pelo worker. O dono pode trocar por uma imagem própria. O handshake de envio vive no backend (recebe, valida, grava no storage) e na interface (formulário). A decisão fixa protocolo, validação e chave no storage (`videos/{videoId}/…`, TD-05 da Fase 03).

**Options:**

### Option A: URL assinada de `PUT` direto ao storage + endpoint de confirmação
- Mesmo padrão do upload de vídeo: a API emite a URL, o cliente envia a imagem ao storage e confirma; a API valida depois (HEAD/GET do objeto).
- **Pros:** API fora do fluxo de bytes; coerente com `phase-03-videos/TD-02`.
- **Cons:** imagem só pode ser inspecionada depois de gravada (arquivo inválido já está no bucket); dois passos para um arquivo de poucos KB; validação de conteúdo exige ler o objeto de volta.

### Option B: `multipart/form-data` via API (Multer) com validação e normalização por `sharp`
- `PATCH`/`PUT` com campo de arquivo; limite no Multer (ex.: 2 MiB), tipos JPEG/PNG/WebP validados por assinatura, redimensionamento/conversão para JPEG (máx. 1280×720) com `sharp`, gravação em `videos/{id}/thumbnail-custom.jpg` e atualização de `thumbnail_key`.
- **Pros:** valida o conteúdo antes de gravar; thumbnails com formato e tamanho uniformes para as listagens; um único request.
- **Cons:** passa pelos bytes pela API (pequenos, aceitável); nova dependência nativa (`sharp`) na imagem Docker.

### Option C: `multipart/form-data` via API, sem processamento de imagem
- Mesmo envio, com checagem de tipo e tamanho, gravando o arquivo como veio.
- **Pros:** sem dependência nova; implementação mais simples.
- **Cons:** tamanhos e proporções variáveis chegam à interface; sem reencode, metadados e conteúdo malicioso embutido permanecem no arquivo servido.

**Recommendation:** Option B — validar e normalizar na API entrega thumbnails previsíveis para painel, página do canal, home e sugestões; o custo é uma dependência (`sharp`, CommonJS, a validar no container Node 25). Evitar `file-type` direto (ESM-only); usar a validação por assinatura do próprio `ParseFilePipe` ou a leitura de formato do `sharp`.

**Decision:** B (multipart via API com validação e normalização por sharp)
**Libraries:** sharp

---

## TD-04: Convenção de paginação e ordenação das listagens

**Scope:** Cross-layer

**Capability:** Transversal — covers: "Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)"; "Página pública do canal com informações e listagem de vídeos"

**Context:** As duas primeiras listagens do projeto nascem aqui: o painel do dono (tabela, todas as publicações e rascunhos, com status) e a página pública (só vídeos publicados e `public`). A Fase 07 reutilizará a convenção na home e na busca ("paginação ou scroll infinito"). Backend (forma da query e do envelope) e interface (controles de navegação) ficam acoplados.

**Options:**

### Option A: Offset (`page` + `pageSize`) com total
- Resposta `{ items, page, pageSize, total }`; ordenação por parâmetro (`sort`, `order`).
- **Pros:** simples; permite "ir para a página N" e mostrar o total; ordenação por qualquer coluna do painel.
- **Cons:** `OFFSET` degrada em tabelas grandes; itens inseridos durante a navegação deslocam as páginas (repetição/omissão).

### Option B: Cursor (keyset) em todas as listagens
- Resposta `{ items, nextCursor }`; cursor codifica `(published_at, id)`; ordem fixa por data.
- **Pros:** performance estável com índice composto; resultado consistente para scroll infinito.
- **Cons:** sem total nem salto de página; ordenar por colunas arbitrárias (tabela do painel) exige cursor por coluna ou fica restrito.

### Option C: Híbrida — offset no painel, cursor nas listagens públicas
- Painel (volume pequeno por canal, ordenação variável): Option A. Página pública do canal e, depois, home/busca (volume grande, scroll infinito): Option B.
- **Pros:** cada caso usa o mecanismo que combina com ele; a convenção já cobre a Fase 07.
- **Cons:** dois envelopes de resposta para manter e documentar no OpenAPI.

**Recommendation:** Option C — o painel é uma tabela com colunas ordenáveis e poucos itens por canal, enquanto as listagens públicas crescem e se beneficiam de keyset. Fixar agora evita reabrir a convenção na Fase 07. Registra-se o custo de dois envelopes; se a equipe preferir um só, Option A com revisão futura na Fase 07 é a alternativa mais simples.

**Decision:** C (offset no painel, cursor nas listagens públicas)

---

## TD-05: Contadores de visualizações, likes e comentários no painel

**Scope:** Backend

**Capability:** Painel de gerenciamento de vídeos do canal (thumbnail, título, visualizações, likes, comentários, tempo de publicação e status)

**Context:** O painel deve listar visualizações, likes e comentários, mas essas funcionalidades só existem nas Fases 05 (visualizações) e 06 (likes e comentários). A Fase 04 precisa decidir se e como o contrato do painel já inclui os campos.

**Options:**

### Option A: Colunas de contador denormalizadas em `videos`, valor inicial 0
- `view_count`, `like_count`, `dislike_count`, `comment_count` (inteiros, default 0, `NOT NULL`) criados agora; a API do painel já devolve os campos. Fases 05/06 passam a incrementá-los.
- **Pros:** contrato do painel completo desde já; leitura da listagem sem joins nem `COUNT(*)`; Fases futuras só escrevem.
- **Cons:** denormalização exige manter os contadores consistentes nas Fases 05/06 (transações ou jobs de reconciliação); colunas sem produtor até lá.

### Option B: Derivar por `COUNT` das tabelas futuras
- Não cria colunas; quando as tabelas existirem, a API faz agregação.
- **Pros:** sem redundância de dados.
- **Cons:** as tabelas não existem; no painel, `COUNT` por linha encarece a listagem; precisaria de valor fixo `0` temporário no código.

### Option C: Omitir os campos até as Fases 05/06
- A API do painel não expõe os contadores agora.
- **Pros:** nenhuma coluna ociosa.
- **Cons:** o contrato do painel muda depois (campos novos) e a coluna do painel fica incompleta nesta fase.

**Recommendation:** Option A — alinhada à orientação dada pelo usuário em 2026-10-13 (criar colunas de contador com valor 0). A estratégia de incremento e de consistência fica para as TDs das Fases 05/06.

**Decision:** A (colunas de contador denormalizadas com valor 0) — definido pelo usuário em 2026-10-13, antes desta pesquisa.

---

## TD-06: Política de alteração do nickname do canal

**Scope:** Backend

**Capability:** Transversal — covers: "Edição das informações do canal: nickname, nome e descrição"; "Página pública do canal com informações e listagem de vídeos"

**Context:** O nickname é o identificador público do canal e a chave da URL da página pública. Hoje nasce do prefixo do e-mail (`phase-02-auth/TD-10`: `[a-z0-9_]`, único, com sufixo aleatório em colisão). A Fase 04 permite editá-lo, o que pode quebrar links e abrir espaço para "reserva" de nomes.

**Options:**

### Option A: Alteração livre, único globalmente, nome antigo liberado
- Mesmas regras de formato e unicidade do cadastro; troca imediata; conflito devolve `409`.
- **Pros:** simples; sem tabela extra; mesma validação já existente.
- **Cons:** links antigos para a página do canal quebram (`404`); o nome antigo pode ser tomado por outro usuário.

### Option B: Alteração livre com histórico e redirecionamento
- Tabela `channel_nickname_history`; a rota pública resolve o nickname antigo para o atual (redirecionamento) e o nome antigo fica reservado ao dono.
- **Pros:** links antigos continuam válidos; evita sequestro de nome após a troca.
- **Cons:** tabela, regra de reserva e rota de resolução adicionais; mais superfície de teste.

### Option C: Alteração livre com limite de frequência
- Option A com um intervalo mínimo entre trocas (ex.: 30 dias), registrado em `nickname_changed_at`.
- **Pros:** reduz abuso e rotatividade sem tabela de histórico.
- **Cons:** não resolve links quebrados; exige coluna e mensagem de erro específica.

**Recommendation:** Option A — o plano não pede preservação de links e a página pública ainda não é referenciada por nenhum artefato persistente (as URLs de vídeo usam `public_id`, não o nickname). Se a Fase 06/07 passar a incorporar links de canal (inscrições, busca), o histórico da Option B pode entrar como Revision/Supersede.

**Decision:** A (nickname livre, único, nome antigo liberado)

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Cross-layer | Modelo de publicação e visibilidade do vídeo | A (`published_at` + `visibility`) | A |
| TD-02 | Backend | Categorias de vídeo | A (tabela `categories` semeada, API somente leitura) | A |
| TD-03 | Cross-layer | Upload da thumbnail customizada | B (multipart via API + `sharp`) | B |
| TD-04 | Cross-layer | Convenção de paginação e ordenação | C (offset no painel, cursor nas listagens públicas) | C |
| TD-05 | Backend | Contadores de visualizações, likes e comentários | A (colunas com valor 0) | A |
| TD-06 | Backend | Política de alteração do nickname | A (livre, único, nome antigo liberado) | A |
