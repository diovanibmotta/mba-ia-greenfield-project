---
scope_type: phase
related_phases: [3]
status: pending
date: 2026-10-06
scope_description: "Fase 03 — armazenamento de vídeos, fila de processamento, upload de até 10GB, worker FFmpeg, URL única, streaming e download"
---

# Technical Decisions — Phase 03: Upload e Processamento de Vídeos

_Subprojects in scope:_

- `nestjs-project/` — backend: módulo de vídeos, fila, worker, storage, migration. Recebe TD-01 a TD-09.
- `next-frontend/` — sem TD de implementação nesta fase. A interface de vídeo está fora do escopo (enunciado). TD-02 e TD-07 definem o contrato de upload e de streaming que o frontend consumirá em fase futura, então ficam registrados como cross-layer.

**Constraints herdados (não reabertos):** `@nestjs/config` + Joi (Fase 01); JWT com guard global e `@Public()` (Fase 02); `DomainException` + `DomainExceptionFilter` com formato `{ statusCode, error, message }` (Fase 02); `@nestjs/throttler` (Fase 02); OpenAPI com `openapi.json` exportado (decisão cross-layer existente); PostgreSQL 17 como banco principal; Docker Compose como único ambiente; object storage = MinIO local / S3 em produção (não é decisão).

**Versões instaladas relevantes (nestjs-project/package.json):** `@nestjs/common` ^11.0.1, `@nestjs/core` ^11.0.1, `typeorm` ^0.3.28, `pg` ^8.20.0. Projeto compila em CommonJS (`nodenext`, Jest com `ts-jest`).

**Evidências de pesquisa usadas nas recomendações:**
- `@nestjs/bullmq` 11.0.x é compatível com NestJS 11; `bullmq` 5.x é a linha ativa do BullMQ ([docs.bullmq.io](https://docs.bullmq.io/guide/nestjs/)).
- `fluent-ffmpeg` está deprecated no npm, sem manutenção ativo ([npm](https://npmjs.com/package/fluent-ffmpeg)).
- `nanoid` v5 é ESM-only; em projeto CommonJS exige v3 ou alternativa ([referência](https://bobbyhadz.com/blog/javascript-error-err-require-esm-require-of-es-module-not-supported)).
- `tus-node-server` 2.0 (mar/2025) é ESM-only e exige Node ≥ 20.19 ([tus.io](https://tus.io/blog/2025/03/25/tus-node-server-v200)).
- Multipart upload com URLs assinadas por parte (`UploadPart`) permite retomada parte a parte ([AWS / filebase](https://filebase.com/blog/how-browser-uploads-work-with-pre-signed-s3-urls/)).
- MinIO suporta URLs GET assinadas com `response-content-disposition` e respostas 206 para `Range` ([referência](https://tessl.io/registry/tessl/npm-minio/8.0.0/files/docs/presigned-operations.md)).
- Versões de `pg-boss` nas fontes consultadas são inconsistentes (10.x e 12.x apareceram). Confirmar versão exata no npm antes de fixar, em `plan-resolve`.

---

## TD-01: Fila de processamento (tecnologia de fila)

**Scope:** Backend

**Capability:** Serviço de processamento em segundo plano (filas)

**Context:** O enunciado deixa a tecnologia de fila em aberto ("TBD" no project-plan). Ela é consumida pela API (publica job após upload) e pelo worker (consome e atualiza status). Precisa suportar retry com backoff e estado de falha, pois alimenta o ciclo de status (TD-08).

**Options:**

### Option A: BullMQ + Redis
- Biblioteca de fila sobre Redis, integrada ao NestJS via `@nestjs/bullmq`. Jobs têm `attempts`, `backoff`, estados `failed`/`completed` e eventos prontos.
- **Pros:** retry e backoff nativos (cobre TD-08 sem código próprio); integração oficial com NestJS 11; ampla documentação e uso.
- **Cons:** adiciona um serviço novo (Redis) ao Compose e mais uma dependência de infra; enqueue não é transacional com o banco.

### Option B: pg-boss (fila sobre PostgreSQL)
- Fila implementada em tabelas do próprio PostgreSQL usando `SKIP LOCKED`. Não exige serviço novo.
- **Pros:** zero infraestrutura nova; o banco já existe e a fila pode participar da mesma transação do cadastro do vídeo.
- **Cons:** carga adicional no banco; retry/backoff existem mas com menos ferramental de observabilidade; versão a confirmar (fontes divergentes).

### Option C: RabbitMQ
- Broker AMQP dedicado, consumido via `@nestjs/microservices`.
- **Pros:** semântica de broker madura (filas duráveis, dead-letter exchanges).
- **Cons:** mais um serviço pesado para um volume de jobs baixo; integração com retry e estado de job exige mais código.

**Recommendation:** Option A (BullMQ + Redis). O retry com backoff e o estado de falha nativos reduzem código próprio no ciclo de status, e a integração com NestJS 11 é oficial. O custo é um serviço Redis no Compose, aceitável. Option B é alternativa válida se a meta for zero infraestrutura nova; registra-se que perde-se o enqueue transacional, mitigado com TD-08 (linha de vídeo criada antes do enqueue).

**Decision:** _[pending]_

---

## TD-02: Estratégia de upload de arquivos de até 10GB

**Scope:** Cross-layer

**Capability:** Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance

**Context:** Passar 10GB pela API bloqueia workers HTTP e consome banda/memória do backend. O upload precisa ser retomável em falha de conexão (project-plan, "Pontos de atenção"). O contrato (sequência de chamadas) envolve backend e frontend, por isso é cross-layer. O frontend ainda não tem UI de vídeo nesta fase, mas o contrato é definido aqui.

**Options:**

### Option A: Multipart upload com URLs assinadas por parte (direto ao storage)
- A API cria o rascunho e o multipart upload, e emite uma URL assinada por parte (`UploadPart`). O cliente envia as partes diretamente ao MinIO/S3, em paralelo. Para retomar, a API lista as partes já enviadas (`ListParts`) e emite URLs só das faltantes. A API finaliza com `CompleteMultipartUpload`.
- **Pros:** bytes nunca passam pela API; retomada parte a parte; sem servidor de protocolo extra; usa o padrão S3-compatível (MinIO e S3 iguais).
- **Cons:** lógica de partes no cliente; limites do S3 a respeitar (máx. 10.000 partes, mín. 5 MiB por parte exceto a última); requer CORS configurado no bucket; exige lifecycle para abortar uploads incompletos.

### Option B: Protocolo tus (resumable upload)
- Servidor tus (`tus-node-server` com `@tus/s3-store`) recebe os bytes e retoma pelo protocolo tus; cliente usa `tus-js-client`.
- **Pros:** protocolo padronizado de retomada; clientes prontos.
- **Cons:** `tus-node-server` 2.x é ESM-only e o projeto é CommonJS; o servidor tus passa os bytes pela API (mesmo que em streaming), contrariando "sem impacto na performance"; uma rota extra fora do modelo NestJS.

### Option C: Upload pela API em streaming (multipart form)
- Cliente envia o arquivo para um endpoint NestJS que repassa o stream ao storage.
- **Pros:** mais simples de implementar; sem URL assinada.
- **Cons:** API carrega o tráfego de 10GB; sem retomada nativa; contraria o requisito explícito do enunciado.

**Recommendation:** Option A. É a única opção em que a API não processa os bytes, cumpre a retomada por parte e usa o padrão S3 que o MinIO implementa. A Option B seria comparável em retomada, mas traz o ESM-only e o tráfego pela API. Definir na implementação: tamanho de parte (ex.: 16 MiB → 640 partes para 10GB), TTL das URLs assinadas e regra de lifecycle para uploads abandonados.

**Decision:** _[pending]_

---

## TD-03: Runtime do worker e extração de metadados

**Scope:** Backend

**Capability:** Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** O worker roda FFmpeg/ffprobe, operação pesada e de CPU. Precisa consumir a fila (TD-01) e atualizar o banco e o storage. A forma de rodar o worker e de invocar o FFmpeg afeta o Dockerfile, o Compose e o código.

**Options:**

### Option A: Mesmo codebase e imagem, entrypoint dedicado, binários via `child_process`
- Um segundo entrypoint do NestJS (application context sem HTTP) roda na mesma imagem com `ffmpeg`/`ffprobe` instalados. A extração chama `ffprobe -print_format json` via `child_process`.
- **Pros:** sem dependência de wrapper; saída JSON estável do ffprobe; reutiliza módulos, entidades e config do backend.
- **Cons:** imagem da API passa a ter FFmpeg (aumenta tamanho) ou exige uma imagem-base comum; parsing e tratamento de erro do processo são responsabilidade nossa.

### Option B: Wrapper npm `fluent-ffmpeg`
- Biblioteca de API fluente sobre o FFmpeg.
- **Pros:** API conhecida; menos código de montagem de comando.
- **Cons:** deprecated/sem manutenção ativa; dependência de risco para um componente crítico.

### Option C: Projeto/pacote separado para o worker (sem NestJS)
- Worker em outro diretório com seu próprio `package.json`, imagem e consumo direto da fila.
- **Pros:** imagem enxuta; isolamento total.
- **Cons:** duplica entidades, config e acesso ao banco; viola "reuse os padrões do projeto".

**Recommendation:** Option A. Reusa o backend (entidades, config, repositórios), evita o wrapper deprecated e mantém o FFmpeg isolado na imagem do worker. Definir na implementação: se a API usa a mesma imagem (com FFmpeg) ou se o serviço `video-worker` usa imagem própria a partir da mesma base.

**Decision:** _[pending]_

---

## TD-04: Política de geração de thumbnail

**Scope:** Backend

**Capability:** Geração automática de thumbnail a partir de um frame do vídeo

**Context:** O enunciado pede "um frame do vídeo" sem definir qual. A escolha afeta qualidade visual e custo de processamento.

**Options:**

### Option A: Frame em posição relativa fixa (ex.: 10% da duração, mínimo 1s)
- FFmpeg extrai um frame em instante calculado a partir da duração já obtida (TD-03).
- **Pros:** determinístico; barato; evita frame inicial preto comum em vídeos.
- **Cons:** pode pegar frame pouco representativo.

### Option B: Detecção de cena (filtro `select` com `scene`)
- FFmpeg analisa o vídeo para escolher um frame de mudança de cena.
- **Pros:** thumbnails melhores em média.
- **Cons:** processa o vídeo inteiro (lento em 10GB); complexidade maior.

### Option C: Primeiro keyframe (t = 0)
- Extrai o primeiro frame do arquivo.
- **Pros:** trivial e rápido.
- **Cons:** frequentemente preto ou logotipo.

**Recommendation:** Option A. Custo previsível em vídeos grandes e qualidade aceitável para uma fase sem curadoria de thumbnail (customização é Fase 04). A Option B é candidata a melhoria futura, não a esta fase.

**Decision:** _[pending]_

---

## TD-05: Convenção de chaves e buckets no object storage

**Scope:** Backend

**Capability:** Serviço de armazenamento de arquivos (vídeos e thumbnails)

**Context:** API (TD-02), worker (TD-03) e streaming (TD-07) referenciam os mesmos objetos. As chaves ficam gravadas no banco. Mudar a convenção depois exige migração de objetos.

**Options:**

### Option A: Bucket único com prefixo por ID interno
- Um bucket (ex.: `streamtube-media`) com `videos/{videoId}/original.{ext}` e `videos/{videoId}/thumbnail.jpg`, usando o UUID interno do vídeo.
- **Pros:** uma configuração de bucket e de CORS/lifecycle; chave estável mesmo se a URL pública mudar (TD-06).
- **Cons:** política de acesso precisa separar prefixos se for necessário no futuro.

### Option B: Buckets separados (originais e thumbnails)
- `streamtube-originals` e `streamtube-thumbs`.
- **Pros:** política de acesso distinta por tipo.
- **Cons:** duas configurações de bucket para o mesmo fluxo; mais superfície de configuração em compose e envs.

### Option C: Chave derivada do slug público
- `videos/{slug}/...`.
- **Pros:** chave legível.
- **Cons:** acopla storage à URL pública; renomear o slug exige mover objetos.

**Recommendation:** Option A, com chaves por UUID interno e nunca por slug. Mantém uma configuração de bucket e desacopla storage de URL.

**Decision:** _[pending]_

---

## TD-06: Identificador de URL única por vídeo

**Scope:** Backend

**Capability:** URL única por vídeo, sem conflito com outros vídeos

**Context:** O project-plan pede URL "curta e única que nunca conflite". A unicidade é garantida por constraint no banco; a dúvida é como gerar o identificador. Caso especial: `nanoid` v5 é ESM-only e o projeto é CommonJS.

**Options:**

### Option A: ID aleatório curto em base62 (11 caracteres), gerado com `node:crypto`
- `randomBytes` mapeado para um alfabeto base62, unique constraint no banco e retry em colisão.
- **Pros:** sem dependência nova; curto; ~64 bits de entropia; colisão tratada pelo banco.
- **Cons:** implementação própria pequena (precisa de teste de distribuição básico).

### Option B: `nanoid` v3 (CommonJS)
- Biblioteca estabelecida na versão compatível com CommonJS.
- **Pros:** API pronta; tamanho configurável.
- **Cons:** v3 fica sem evolução; adiciona dependência por uma função pequena.

### Option C: UUID v4
- Identificador padrão do banco (já é o PK).
- **Pros:** zero código; sem colisão prática.
- **Cons:** 36 caracteres, não é "curta".

**Recommendation:** Option A. Atende "curta e única" sem dependência e sem o problema ESM-only. O retry em colisão usa o constraint, como o padrão de nickname da Fase 02 (SI-02.6).

**Decision:** _[pending]_

---

## TD-07: Estratégia de streaming e download

**Scope:** Cross-layer

**Transversal — covers:** Reprodução via streaming (sem necessidade de download completo); Download do vídeo pelo usuário

**Context:** O diagrama de arquitetura (`docs/diagrams/software-arch.mermaid`) já desenha `Rel(frontend, storage, "Streams", "HTTPS")`, ou seja, o streaming é direto do storage. A decisão é como a API autoriza e emite esse acesso, e como o download é servido com nome de arquivo. Afeta contrato da API e o consumo pelo frontend.

**Options:**

### Option A: URL GET assinada emitida pela API, servida direto pelo storage
- A API emite URL assinada com TTL curto por requisição. O storage responde com `Range` (206) e aceita `response-content-disposition` para download com nome de arquivo.
- **Pros:** alinhado ao diagrama; storage faz `Range` nativamente; API não carrega bytes; download sem código extra.
- **Cons:** URL é um bearer temporário (quem a tiver acessa até expirar); a expiração precisa de janela razoável; CORS no bucket.

### Option B: Proxy pela API com `Range` manual (`StreamableFile`)
- A API lê do storage e devolve os bytes com `Range` implementado por ela.
- **Pros:** controle total de autorização em cada byte; URL estável.
- **Cons:** contradiz o diagrama; consome banda e conexões da API; implementar `Range` corretamente é trabalho próprio.

### Option C: CDN com URLs assinadas ou cookies assinados
- Camada de CDN na frente do storage.
- **Pros:** cache e escala.
- **Cons:** infraestrutura fora do escopo desta fase; sem CDN no compose.

**Recommendation:** Option A. Segue o diagrama, aproveita o `Range` do storage e mantém a API fora do fluxo de bytes. O risco do bearer temporário é aceitável nesta fase, porque visibilidade e autorização de vídeo são Fase 04; o TTL curto mitiga.

**Decision:** _[pending]_

---

## TD-08: Ciclo de status do vídeo e tratamento de falha

**Scope:** Backend

**Transversal — covers:** Pré-cadastro automático do vídeo como rascunho ao iniciar o upload; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** O enunciado define o ciclo "rascunho → processando → pronto/erro". Falta decidir se há estados intermediários, quantas tentativas o worker faz antes de marcar erro e como o erro é exposto.

**Options:**

### Option A: Ciclo do enunciado com retries internos ao estado `processando`
- `rascunho` (criado ao iniciar upload) → `processando` (após upload completo, job enfileirado) → `pronto` ou `erro`. O worker faz N tentativas com backoff (TD-01) dentro de `processando`; só marca `erro` após esgotar. Guarda `error_reason` e número de tentativas.
- **Pros:** exatamente o ciclo pedido; retries não aparecem como estado para o usuário; falha fica auditável.
- **Cons:** `processando` pode durar mais de uma tentativa; é preciso decidir o número de tentativas.

### Option B: Ciclo do enunciado, sem retry automático
- Ao primeiro erro, marca `erro` imediatamente; o usuário refaz o upload.
- **Pros:** mais simples.
- **Cons:** falhas transitórias (ex.: storage indisponível por segundos) viram erro para o usuário.

### Option C: Estado intermediário `enviando` além do ciclo do enunciado
- `rascunho` → `enviando` (multipart em curso) → `processando` → `pronto`/`erro`.
- **Pros:** o usuário e o sistema distinguem upload em curso de upload parado.
- **Cons:** foge do ciclo exato do enunciado; mais transições para testar.

**Recommendation:** Option A. Cumpre o ciclo do enunciado e torna falhas transitórias invisíveis ao usuário, com `error_reason` e tentativas gravados. Uploads abandonados em `rascunho` são tratados pela regra de lifecycle de TD-02.

**Decision:** _[pending]_

---

## TD-09: Validação do arquivo enviado e aplicação do limite de 10GB

**Scope:** Backend

**Capability:** Transversal — covers: Upload de vídeos com suporte a arquivos de até 10GB sem impacto na performance; Processamento automático do vídeo após upload (extração de duração e metadados)

**Context:** Com upload direto ao storage (TD-02), os bytes não passam pela API, então nada impede por padrão um arquivo acima de 10GB ou que não seja vídeo. A URL assinada de `UploadPart` não limita o tamanho total, e o cliente é não confiável. É preciso decidir onde o limite e o formato são verificados e o que acontece com arquivo inválido, sem duplicar o ciclo de falha do TD-08. Origem: MD-1 do `validation.md` da fase.

**Options:**

### Option A: Validação em três pontos (declaração, finalização e worker)
- Na criação do upload, a API exige `fileSize` e `contentType` declarados, rejeita (400) tamanho acima de 10GiB ou `contentType` fora de uma lista de contêineres de vídeo permitidos, e calcula o número de partes a partir do `fileSize`. Na finalização, a API soma o `Size` retornado por `ListParts`; se a soma exceder o limite ou divergir do declarado, executa `AbortMultipartUpload` e rejeita. O worker valida com `ffprobe` que existe ao menos um stream de vídeo; caso contrário marca `erro` com `error_reason` de mídia inválida, sem retry (falha determinística).
- **Pros:** o limite é aplicado de forma verificável (soma real das partes), não apenas declarada; lixo é descartado antes de gastar processamento; falha de mídia inválida não consome retries do TD-08.
- **Cons:** três pontos de validação a testar; a lista de contêineres permitidos é uma política a manter.

### Option B: Validação só no worker
- A API aceita qualquer arquivo; o `ffprobe` do worker rejeita o que não for vídeo.
- **Pros:** mais simples; um único ponto.
- **Cons:** aceita e armazena 10GB+ de conteúdo inválido; o limite de 10GB não é aplicado de fato; custo de storage e de processamento desperdiçado.

### Option C: Option A mais inspeção de magic bytes na finalização
- Além de A, a API lê os primeiros bytes do objeto com `GET` com `Range` e confere a assinatura do contêiner antes de enfileirar.
- **Pros:** rejeita não-vídeo antes de enfileirar, de forma síncrona.
- **Cons:** round-trip extra ao storage por upload; assinaturas por contêiner são frágeis (ex.: MP4 varia por brand), duplicando o que o `ffprobe` já faz melhor.

**Recommendation:** Option A. É a única que aplica o limite de 10GB de forma verificável (soma de `ListParts`) e mantém a validação de mídia no `ffprobe`, que é a fonte confiável de formato. A Option C duplica o `ffprobe` com heurística frágil. Definir na implementação: a lista exata de `contentType` permitidos e o `error_reason` para mídia inválida, coerente com o catálogo de erros do plano.

**Decision:** _[pending]_

---

## Decisions Summary

| ID | Scope | Decision | Recommendation | Choice |
|----|-------|----------|---------------|--------|
| TD-01 | Backend | Fila de processamento | A (BullMQ + Redis) | _[pending]_ |
| TD-02 | Cross-layer | Estratégia de upload 10GB | A (multipart com URLs assinadas por parte) | _[pending]_ |
| TD-03 | Backend | Runtime do worker e extração de metadados | A (mesmo codebase, entrypoint dedicado, ffprobe via child_process) | _[pending]_ |
| TD-04 | Backend | Política de thumbnail | A (frame em 10% da duração) | _[pending]_ |
| TD-05 | Backend | Convenção de chaves e buckets | A (bucket único, prefixo por UUID interno) | _[pending]_ |
| TD-06 | Backend | Identificador de URL única | A (base62 de 11 caracteres via node:crypto) | _[pending]_ |
| TD-07 | Cross-layer | Streaming e download | A (URL GET assinada emitida pela API, direto do storage) | _[pending]_ |
| TD-08 | Backend | Ciclo de status e falha | A (ciclo do enunciado com retries internos) | _[pending]_ |
| TD-09 | Backend | Validação do arquivo e limite de 10GB | A (declaração + soma de ListParts + ffprobe) | _[pending]_ |
