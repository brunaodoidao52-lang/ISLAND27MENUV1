# AI_COMPANY — organização digital de agentes da Auto Escola Raça

Equipe interna de agentes especializados com CEO coordenador, tarefas com TASK_ID,
protocolo de comunicação, permissões mínimas, aprovação humana, memória em três níveis,
logs de auditoria à prova de adulteração e monitoramento.

**Independente de sistemas externos:** nada aqui acessa site, CFC Produtivo, WhatsApp,
Instagram, Facebook, sistemas de terceiros ou APIs. Um teste automático garante que nenhum
arquivo do código use rede.

## Jeito fácil de usar

**Aqui no Claude** (digite na conversa):

| Comando | O que faz |
|---|---|
| `/raca` | Resumo da equipe, o que está esperando você e as mensagens |
| `/ficha Maria Souza, CPF 529.982.247-25, categoria B, primeira habilitação, 2.500 com 500 de entrada no PIX e 4 parcelas a partir de 15/11/2026` | Lança a ficha (o Claude não inventa nada: o que faltar, o CAPTADOR pede) |
| `/pendencias` | O que está esperando você |
| `/aprovar` | Mostra o lançamento com todas as parcelas e pergunta se você aprova |
| `/completar 1 vencimento 15/11/2026` | Completa o que faltou |
| `/resolver` | Trata uma tarefa parada (tentar de novo ou cancelar) |

**No computador** (na pasta do projeto; no Windows use `raca` em vez de `./raca`):

```
./raca              menu com opções numeradas
./raca ficha        pergunta os dados do aluno um por um (confere CPF, datas e valores na hora)
./raca pendencias   o que está esperando você
./raca aprovar      mostra o lançamento e pergunta sim/não
./raca completar    pergunta só o que faltou
./raca resolver     trata uma tarefa parada
./raca status       resumo da equipe
./raca lancamentos  fichas já lançadas
```

Segurança: nenhuma aprovação acontece sem um "sim" seu. Se ninguém responder, nada é decidido.

## Hierarquia

```
                 PROPRIETÁRIO  (único que aprova, ativa/desativa agentes)
                      │
                      ▼
                     CEO        (coordena, supervisiona, valida, reporta)
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼
    CAPTADOR  ──▶  LANÇADOR      (ativos)
                      │
   FINANCEIRO · AUDITOR · COMERCIAL · ATENDIMENTO · MARKETING · RELATÓRIOS
                (preparados: ficha completa, inativos até você escolher)
```

| Agente | Situação | Função |
|---|---|---|
| **CEO** v1.0 | ativo | Recebe seus pedidos, cria o TASK_ID, escolhe quem faz, acompanha, valida e reporta. Não executa o trabalho dos especialistas. |
| **CAPTADOR** v1.0 | ativo | Recebe os dados brutos da matrícula e entrega a ficha estruturada e conferida (CPF, datas, valores, campos obrigatórios). Não grava nada. |
| **LANÇADOR** v1.0 | ativo | Confere duplicidade, monta as parcelas, **pede sua aprovação** e só então registra no livro interno, uma única vez. |
| Financeiro, Auditor, Comercial, Atendimento, Marketing, Relatórios | preparados | Ficha completa no padrão; sem implementação ainda. Não podem ser ativados antes de implementados. |

> **Interpretação usada:** a especificação cita CAPTADOR e LANÇADOR sem descrever a função.
> Pelo contexto (sistema de lançamento de fichas) foram definidos como acima. Se a função for
> outra, basta editar `agents/captador/agente.json` e `agents/lancador/agente.json` (subindo a versão).

## Pastas

```
AI_COMPANY/
├── raca.js           ← comandos fáceis (./raca)
├── empresa.js        ← comandos completos/avançados
├── agents/           ← uma pasta por agente: agente.json (ficha), FICHA.md (legível), handler.js (implementação)
├── skills/           ← 7 skills compartilhadas: skill.json + index.js + FICHA.md
├── orchestration/    ← motor: registro, tarefas, protocolo, roteador, executor, monitor, fluxos.json
├── memory/           ← memória de tarefa / operacional / estratégica
├── logs/             ← auditoria encadeada por hash
├── permissions/      ← política: permissões, ferramentas, aprovação humana
├── tasks/            ← (dados) tarefas, mensagens, livro interno de lançamentos
└── tests/            ← 74 testes automáticos
```

Os dados de uso ficam em `*/dados/` (fora do Git).

## Como usar

```bash
node AI_COMPANY/empresa.js ajuda
node AI_COMPANY/empresa.js registro                 # AGENT REGISTRY
node AI_COMPANY/empresa.js pedido "Lançar ficha da Maria" --arquivo maria.txt
node AI_COMPANY/empresa.js aprovar TASK-20261015-0001 "conferi os valores"
node AI_COMPANY/empresa.js painel                   # as 6 perguntas do CEO
node AI_COMPANY/empresa.js verificar-log            # confere se o log foi adulterado
node AI_COMPANY/empresa.js retomar TASK-... "o que foi resolvido"
node AI_COMPANY/empresa.js confirmar-execucao TASK-... sim|nao "como conferiu"
```

`maria.txt` tem uma informação por linha:

```
Nome: Maria Souza
CPF: 529.982.247-25
Categoria: B
Serviço: Primeira habilitação
Valor total: 2.500,00
Entrada: 500
Forma da entrada: PIX
Parcelas: 4
Primeiro vencimento: 15/11/2026
```

O que acontece:

1. **CEO** cria `TASK-AAAAMMDD-XXXX`, reconhece o fluxo `LANCAR_FICHA` e delega ao CAPTADOR.
2. **CAPTADOR** confere tudo. Faltou algo → para e o CEO te avisa o que falta (`complementar`). Dado inválido ou contraditório → erro com o motivo de cada campo.
3. **LANÇADOR** confere duplicidade e para em **HUMAN APPROVAL REQUIRED**, com o resumo.
4. Você aprova → é gravado **exatamente** o que você viu (ficha, parcelas e datas), **uma vez**. Você nega → nada é registrado.
5. **CEO** confere a checagem de qualidade, a execução registrada e o próprio livro (o lançamento existe, é um só e as parcelas fecham), conclui e te entrega o relatório.

Se algo falhar **depois** de começar a gravar (queda, erro no meio), o sistema não arrisca repetir:
a tarefa fica BLOCKED até você conferir e responder com `confirmar-execucao`.

Todo o caminho mantém o mesmo TASK_ID e fica no log (`node AI_COMPANY/empresa.js log TASK-...`).

## Regras garantidas pelo código (não só escritas)

| Regra | Onde |
|---|---|
| TASK_ID único `TASK-AAAAMMDD-XXXX`, mantido em toda mensagem | `orchestration/tarefas.js`, `protocolo.js` |
| Status só pelos caminhos permitidos; COMPLETED só pela validação do CEO com as 7 perguntas | `definicoes.js`, `tarefas.validar` |
| Protocolo padrão; recusa campo faltando/extra, TASK_ID trocado, canal ou ação não permitidos | `protocolo.js` |
| Mínimo privilégio: cada agente só usa as permissões, ferramentas e skills da própria ficha | `permissions/politica.js`, `executor.js` |
| Nenhum agente tem HUMAN_APPROVE nem todas as permissões | `registro.js` (validação das fichas) |
| HUMAN APPROVAL REQUIRED para executar decisões financeiras, exclusões etc.; a aprovação vale só para os dados exatos aprovados e para uma única execução | `tarefas.executar` |
| Duplicidade: pedido repetido não vira outra tarefa; reenvio de mensagem é descartado (repetição depois que a tarefa andou é aceita como nova rodada); operação crítica nunca roda duas vezes; execução incerta ou interrompida bloqueia até o proprietário confirmar; o livro recusa a mesma chave duas vezes | `tarefas.criar`, `protocolo.enviar`, `tarefas.executar`, `ferramentas.js` |
| Erros: registrados com nível e causa, CEO avisado, HIGH/CRITICAL pedem intervenção humana; CRITICAL de agente põe o agente em ERROR | `tarefas.registrarErro`, `executor.js` |
| Auditoria: só acrescenta, encadeada por hash e ancorada no fim (alteração, remoção no meio ou no final é detectada), linha cortada por queda não trava o sistema, dados pessoais mascarados | `logs/auditoria.js` |
| Cada agente recebe cópia congelada da própria ficha e só vê a entrada das tarefas em que trabalha | `executor.contexto` |
| Memória: de tarefa descartada no fim; operacional sem dados pessoais e com validade; estratégica só CEO/proprietário com justificativa | `memory/memoria.js` |
| Versionamento: ficha alterada sem nova versão é recusada; histórico de versões guardado | `registro.js` |
| Balanceamento: especialização, disponibilidade, carga, prioridade e histórico | `skills/task_management` |

## Ativar um agente preparado

1. Implemente `agents/<id>/handler.js` (veja os do CAPTADOR e LANÇADOR como exemplo).
2. Ajuste a ficha se preciso, suba a versão e registre no `CHANGELOG`.
3. `node AI_COMPANY/empresa.js ativar <id>`.

## Criar algo novo (sem reconstruir nada)

| Novo… | Como |
|---|---|
| Agente | Copie `agents/MODELO_AGENTE.json` para `agents/<id>/agente.json` e preencha **todos** os campos. |
| Skill | Copie `skills/MODELO_SKILL.json`, crie `index.js`, liste a skill na ficha dos agentes que usam. |
| Fluxo | Acrescente em `orchestration/fluxos.json` (etapas, aprovação, palavras-chave). |
| Ferramenta | Cadastre em `permissions/politica.js` e implemente em `orchestration/ferramentas.js`. |

Depois rode `node orchestration/gerar_docs.js` (gera as FICHA.md) e os testes.

## Testes

```bash
node --test AI_COMPANY/tests/*.test.js
```

- **Núcleo (14):** TASK_ID, status, qualidade, aprovação, execução única, auditoria, memória, fichas, versões, registro, prioridade, balanceamento, monitoramento e ausência de rede.
- **Agentes (27):** CEO, CAPTADOR e LANÇADOR, cada um com os 9 cenários: entrada correta, incompleta, inválida, erro, duplicada, ambígua, falta de permissão, falha de ferramenta e necessidade de aprovação.
- **Comunicação (8):** CEO→CAPTADOR→LANÇADOR→CEO, CEO→AUDITOR, CEO→FINANCEIRO e CEO→COMERCIAL (inativos são recusados com motivo; ativados com implementação de teste, trocam dados sem perder nada), transmissão de erro e regras do protocolo.
- **Falhas (10):** CAPTADOR falhando, LANÇADOR falhando, CEO recebendo informação incompleta ou falsa, tarefa duplicada, agente sem permissão, ferramenta indisponível, dados contraditórios e laço de correções entre agentes.
- **Comandos fáceis (6):** perguntas guiadas que refazem a pergunta quando o dado está errado, confirmação antes de enviar, aprovação que não decide sem resposta, correção que substitui o valor antigo.
- **Revisão adversarial (9):** um teste para cada problema encontrado pela auditoria independente (rodadas legítimas, falha depois de gravar, aprovação dos dados exatos, ficha congelada, escopo de leitura, log truncado/apagado, erro após o fim, queda no meio, CLI).

## Limites desta etapa

- Os três agentes ativos seguem **regras programadas**. Eles não usam um modelo de IA para "pensar", porque conectar um modelo seria uma integração com API externa, proibida nesta etapa. A estrutura já está pronta para receber essa camada depois.
- O CAPTADOR entende o formato "campo: valor". Documento em foto precisa ser transcrito (sem OCR nesta etapa).
- O livro de lançamentos é interno (`tasks/dados/lancamentos.json`); levar os lançamentos ao sistema do CFC será uma integração futura.
- Quem usa `empresa.js` age como proprietário. Não há login nesta etapa: proteja o acesso ao computador.
- As regras protegem contra agente **com defeito** (tudo passa pelo contexto restrito). O código dos agentes fica no próprio repositório, então quem consegue alterar esse código consegue contornar as regras: mudanças em `agents/*/handler.js` devem ser revisadas como qualquer código.
