---
kind: phase
name: phase-03-videos
status: dirty
issue_count: 11
sources_mtime:
  docs/phases/phase-03-videos/context.md: "2026-10-08T07:20:11-03:00"
  docs/decisions/technical-decisions-phase-03-videos.md: "2026-10-06T08:32:46-03:00"
issues:
  - id: AMB-1
    status: open
    summary: "Quem pode fazer streaming/download (anônimo, dono, status do vídeo)?"
  - id: AMB-2
    status: open
    summary: "Origem do título no pré-cadastro do rascunho não definida"
  - id: MD-1
    status: open
    summary: "Sem TD de formatos aceitos e validação do arquivo enviado"
  - id: OQ-1
    status: open
    summary: "phase-03-videos/TD-01 pending — fila"
  - id: OQ-2
    status: open
    summary: "phase-03-videos/TD-02 pending — upload 10GB"
  - id: OQ-3
    status: open
    summary: "phase-03-videos/TD-03 pending — worker e metadados"
  - id: OQ-4
    status: open
    summary: "phase-03-videos/TD-04 pending — thumbnail"
  - id: OQ-5
    status: open
    summary: "phase-03-videos/TD-05 pending — chaves e buckets"
  - id: OQ-6
    status: open
    summary: "phase-03-videos/TD-06 pending — URL única"
  - id: OQ-7
    status: open
    summary: "phase-03-videos/TD-07 pending — streaming e download"
  - id: OQ-8
    status: open
    summary: "phase-03-videos/TD-08 pending — ciclo de status e falha"
advisories: []
---

# phase-03-videos — Validation

## Findings

### Inconsistencies

_None._

### Ambiguities

- **AMB-1** — Capabilities "Reprodução via streaming" e "Download do vídeo pelo usuário" não dizem quem pode acessar: anônimo, qualquer autenticado ou só o dono do canal, nem se vídeos em `rascunho`/`processando`/`erro` são acessíveis. A Authorization Matrix do plano depende disso. TD-07 só afirma que "visibilidade e autorização de vídeo são Fase 04" e usa URL assinada de TTL curto como mitigação. Explicit choice: definir no TD-07 (via `/plan-resolve`) a regra desta fase, por exemplo dono-apenas para não-`pronto` e qualquer um para `pronto`, ou dono-apenas para tudo até a Fase 04.
- **AMB-2** — "Pré-cadastro automático do vídeo como rascunho ao iniciar o upload" não define de onde vem o título do rascunho (informado no início do upload, derivado do nome do arquivo ou vazio). O Data Model do plano precisa decidir se `title` é obrigatório; a edição de título é Fase 04. Explicit choice: registrar a regra no TD-08 (via `/plan-resolve`).

### Missing Decisions

- **MD-1** — Nenhum TD decide quais formatos/contêineres de vídeo são aceitos, como o limite de 10GB é aplicado (tamanho declarado na criação do upload versus verificado no `CompleteMultipartUpload`) e o que acontece quando o arquivo enviado não é um vídeo válido (falha no `ffprobe`). Isso é estratégia de validação, distinta do ciclo de falha do TD-08. Explicit choice: rodar `/research` para adicionar um TD cobrindo validação de arquivo, ou estender explicitamente o TD-02/TD-08 em `/plan-resolve`.

### Dependency Gaps

_None._

### Inherited Constraint Conflicts

_None._

### Unresolved Open Questions

- **OQ-1** — phase-03-videos/TD-01 pending — Fila de processamento. Resolution: preencher o `**Decision:**` do TD-01 em `docs/decisions/technical-decisions-phase-03-videos.md` via `/plan-resolve phase-03-videos`, depois rodar `/plan-validate phase-03-videos`.
- **OQ-2** — phase-03-videos/TD-02 pending — Estratégia de upload de 10GB. Resolution: idem OQ-1.
- **OQ-3** — phase-03-videos/TD-03 pending — Runtime do worker e extração de metadados. Resolution: idem OQ-1.
- **OQ-4** — phase-03-videos/TD-04 pending — Política de thumbnail. Resolution: idem OQ-1.
- **OQ-5** — phase-03-videos/TD-05 pending — Convenção de chaves e buckets. Resolution: idem OQ-1.
- **OQ-6** — phase-03-videos/TD-06 pending — Identificador de URL única. Resolution: idem OQ-1.
- **OQ-7** — phase-03-videos/TD-07 pending — Streaming e download. Resolution: idem OQ-1.
- **OQ-8** — phase-03-videos/TD-08 pending — Ciclo de status e falha. Resolution: idem OQ-1.

### UI Coverage Gaps

_None._

## Resolved Issues

_No issues resolved yet._
