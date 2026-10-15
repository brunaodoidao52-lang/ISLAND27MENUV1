---
name: resolver
description: Trata uma tarefa parada por erro (tentar de novo, cancelar, ou confirmar se uma gravação aconteceu).
argument-hint: "[número] [retomar|cancelar|aconteceu|nao-aconteceu] [explicação]"
disable-model-invocation: true
allowed-tools: Bash(./raca pendencias) Bash(./raca resolver *)
---

Pedido do proprietário: `$ARGUMENTS`

1. Rode `./raca pendencias` e mostre a tarefa parada e o erro, em português simples.
2. A escolha é do proprietário. Se ele não disse, pergunte com AskUserQuestion:
   - erro comum: "Tentar de novo" (retomar) ou "Cancelar";
   - gravação incerta (o sistema caiu no meio): "A gravação aconteceu" (aconteceu), "Não aconteceu" (nao-aconteceu) ou "Cancelar". Explique que ele deve conferir antes (por exemplo em `./raca lancamentos`).
3. Peça uma explicação curta se ele não deu (ela fica no histórico).
4. Rode `./raca resolver <número> <opção> "<explicação>"` e conte o resultado.

Nunca escolha a opção por ele.
