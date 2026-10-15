# tasks/

Dados das tarefas, gravados pelo motor (`orchestration/tarefas.js`) em `tasks/dados/` (fora do Git):

| Arquivo | Conteúdo |
|---|---|
| `tarefas.json` | Todas as tarefas: TASK_ID, status, responsável, etapas, aprovação, execuções, erros, histórico |
| `contador.json` | Sequência diária do TASK_ID (TASK-AAAAMMDD-XXXX) |
| `mensagens.json` | Todas as mensagens do protocolo entre agentes |
| `lancamentos.json` | Livro interno de lançamentos do LANÇADOR |

Não edite esses arquivos à mão: use `node AI_COMPANY/empresa.js`. Qualquer mudança feita por fora
não passa pelas regras e não entra no log de auditoria.
