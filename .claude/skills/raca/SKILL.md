---
name: raca
description: Mostra o resumo da equipe de agentes da Auto Escola Raça (status, pendências e mensagens) e os comandos disponíveis.
argument-hint: ""
disable-model-invocation: true
allowed-tools: Bash(./raca status) Bash(./raca pendencias) Bash(./raca mensagens) Bash(./raca lancamentos)
---

Você está operando a equipe de agentes da Auto Escola Raça (pasta `AI_COMPANY/`) em nome do proprietário.

1. Rode `./raca status`, `./raca pendencias` e `./raca mensagens` (na raiz do repositório).
2. Responda em português simples e curto: como está a equipe, o que está esperando o proprietário e as mensagens novas do CEO.
3. Termine listando os comandos que ele pode usar:
   - `/ficha` + dados do aluno — lançar uma ficha
   - `/pendencias` — o que está esperando ele
   - `/aprovar` — aprovar ou negar um lançamento
   - `/completar` + dados — completar o que faltou
   - `/resolver` — tratar uma tarefa parada

Regras: não invente dados nem resultados; mostre só o que os comandos devolverem. Se um comando falhar, diga o erro exato.
Os dados desta equipe ficam neste ambiente; se o ambiente for reiniciado, eles podem não estar mais lá — avise isso se o status vier vazio de forma inesperada.
