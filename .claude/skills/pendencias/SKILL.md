---
name: pendencias
description: Mostra o que está esperando o proprietário na equipe de agentes (aprovações, dados faltando, tarefas paradas).
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(./raca pendencias) Bash(./raca mensagens)
---

1. Rode `./raca pendencias` e `./raca mensagens` (na raiz do repositório).
2. Explique em português simples cada item e qual comando resolve: `/aprovar <número>`, `/completar <número> <dados>` ou `/resolver <número>`.
3. Não decida nada por conta própria e não invente informação além do que os comandos mostraram.
