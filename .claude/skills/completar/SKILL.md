---
name: completar
description: Completa ou corrige os dados que faltaram numa ficha parada (o CAPTADOR pediu).
argument-hint: "[número] dados que faltaram (ex.: 1º vencimento 15/11/2026)"
disable-model-invocation: true
allowed-tools: Bash(./raca pendencias) Bash(./raca completar *)
---

Pedido do proprietário: `$ARGUMENTS`

1. Rode `./raca pendencias` para ver as fichas esperando dados e o que foi pedido. Se houver mais de uma e ele não disse o número, pergunte qual.
2. Transforme SOMENTE o que ele escreveu em linhas `Campo: valor` (mesmos nomes do `/ficha`: Nome, CPF, Nascimento, Telefone, E-mail, Endereço, Categoria, Serviço, Valor total, Desconto, Entrada, Forma da entrada, Parcelas, Primeiro vencimento). Nunca invente valores.
3. Se ele não informou algum dado pedido, diga qual falta e pare.
4. Rode `./raca completar <número> --dados "<linhas separadas por \n>"`.
5. Conte o resultado e o próximo passo (normalmente `/aprovar`).
