---
name: ficha
description: Lança a ficha de um aluno pela equipe de agentes (CEO → CAPTADOR → LANÇADOR) a partir dos dados que o proprietário escrever.
argument-hint: "nome, CPF, categoria, serviço, valor total, entrada, forma, parcelas, 1º vencimento"
disable-model-invocation: true
allowed-tools: Bash(./raca ficha *)
---

O proprietário quer lançar a ficha de um aluno. Dados que ele escreveu:

$ARGUMENTS

1. Transforme SOMENTE o que ele escreveu em linhas `Campo: valor`, usando estes nomes:
   `Nome`, `CPF`, `Nascimento`, `Telefone`, `E-mail`, `Endereço`, `Categoria`, `Serviço`, `Valor total`, `Desconto`, `Entrada`, `Forma da entrada`, `Parcelas`, `Primeiro vencimento`.
   - Serviço deve ser um destes, se ficar claro: Primeira habilitação, Adição de categoria, Mudança de categoria, Reciclagem, Renovação, Aulas avulsas.
   - Forma da entrada: Dinheiro, PIX, Cartão de débito, Cartão de crédito, Boleto, Transferência.
   - Datas em dd/mm/aaaa. Valores como ele escreveu (ex.: 2.500,00).
   - **Nunca invente, complete ou "corrija" nenhum dado.** Se algo não foi dito ou ficou dúbio, deixe de fora — o CAPTADOR vai apontar o que falta.
2. Mostre ao proprietário as linhas montadas.
3. Rode: `./raca ficha --dados "<linhas separadas por \n>"` (na raiz do repositório).
4. Conte o resultado em português simples: número da tarefa, o que o CEO respondeu e o próximo passo (`/completar` se faltou dado, `/aprovar` se ficou esperando aprovação).

Nunca aprove nada neste comando: aprovar é só com `/aprovar` e decisão explícita do proprietário.
Se `$ARGUMENTS` estiver vazio, peça os dados do aluno e pare.
