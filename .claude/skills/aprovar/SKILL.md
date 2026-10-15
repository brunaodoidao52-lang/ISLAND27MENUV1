---
name: aprovar
description: Aprovar ou negar um lançamento que está em HUMAN APPROVAL REQUIRED. Só executa a decisão que o proprietário der.
argument-hint: "[número] [sim|nao] [observação]"
disable-model-invocation: true
allowed-tools: Bash(./raca pendencias) Bash(./raca aprovar *)
---

Pedido do proprietário: `$ARGUMENTS`

Esta é uma decisão humana (financeira). Você só transmite a decisão dele; **nunca decide no lugar dele**.

1. Se não veio número, rode `./raca pendencias` e mostre as aprovações pendentes; se houver mais de uma, pergunte qual.
2. Rode `./raca aprovar <número> --ver` e mostre os detalhes completos (aluno, serviço, valor final e cada parcela com vencimento).
3. Se o proprietário já escreveu `sim` ou `nao` no pedido, use essa decisão. Se não escreveu, pergunte com a ferramenta AskUserQuestion: "Aprovar este lançamento?" com as opções "Aprovar" e "Negar". Sem resposta clara, **não faça nada**.
4. Rode `./raca aprovar <número> sim "<observação>"` ou `./raca aprovar <número> nao "<motivo>"` (observação: o que ele escreveu, ou "aprovado pelo proprietário").
5. Conte o resultado em português simples (lançamento nº, se concluído).
