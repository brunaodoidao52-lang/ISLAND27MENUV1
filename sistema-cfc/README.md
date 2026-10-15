# ISLAND27 CFC — gestão de fichas e pagamentos

Sistema simples para autoescola (CFC), inspirado no funcionamento de sistemas como o
CFC Produtivo, com as cores da ISLAND27. Foca em três coisas:

1. **Lançar fichas** dos alunos (dados pessoais + contrato com entrada e parcelas)
2. **Pagamentos realizados** (o que já entrou, com recibo)
3. **Pagamentos pendentes** (o que falta receber, com atrasados e cobrança pelo WhatsApp)

## Como abrir

Não precisa instalar nada. Abra o arquivo `index.html` no navegador (Chrome, Edge, Firefox).
Para testar com dados prontos: **Configurações → Carregar dados de exemplo**.

> Os dados ficam guardados **no navegador** deste computador. Use
> **Configurações → Baixar cópia de segurança** com frequência, e **Restaurar cópia**
> para levar os dados para outro computador.

## Como usar no dia a dia

| Quero… | Onde |
|---|---|
| Cadastrar um aluno novo | **Lançar ficha** → preencher → *Salvar ficha*. As parcelas são criadas sozinhas. |
| Registrar que o aluno pagou | **Pagamentos pendentes** (ou na ficha) → *Receber*. Pagou menos? O restante continua pendente. |
| Dar recibo | Botão *Recibo* (imprime duas vias: aluno e CFC). |
| Cobrar quem está atrasado | **Pagamentos pendentes** → *Mostrar: Atrasadas* → *WhatsApp* (mensagem pronta). |
| Lançar aula extra / taxa | Abrir a ficha → *Nova cobrança*. |
| Ver quanto entrou no mês | **Pagamentos realizados** (total e por forma de pagamento). |
| Corrigir um pagamento lançado errado | *Estornar* — a parcela volta a ficar pendente. |

## Como mexer no código

Tudo é HTML, CSS e JavaScript puro, separado por assunto:

| Arquivo | O que tem |
|---|---|
| `styles.css` | Visual. **As cores ficam no topo** (`:root`) — troque ali para mudar o tema inteiro. |
| `js/dados.js` | Onde os dados são salvos, geração de parcelas, listas de serviços/categorias/formas de pagamento. |
| `js/fichas.js` | Lista, formulário e tela da ficha do aluno (e impressão da ficha). |
| `js/pagamentos.js` | Pagamentos realizados, pendentes, receber, estornar e recibo. |
| `js/inicio.js` | Painel inicial com o resumo. |
| `js/config.js` | Dados da autoescola, backup e dados de exemplo. |
| `js/app.js` | Liga o menu às telas. |

Para adicionar um serviço, categoria ou forma de pagamento, edite as listas
`SERVICOS`, `CATEGORIAS` e `FORMAS` no começo de `js/dados.js`.

## Cores ISLAND27

Fundo `#08090C` / `#0C0E13`, painéis `#14161C`, ciano `#7FE3FF`, azul `#2AA9E0`,
marinho `#12213F`, texto `#F2F4F8`; fontes Space Grotesk (títulos) e IBM Plex Sans (texto).
Verde, amarelo e vermelho suaves foram acrescentados só para indicar pago / vence hoje / atrasado.

## Sobre a referência

O site cfcprodutivo.com.br não pôde ser acessado a partir do ambiente onde este sistema foi
feito, então nenhum código ou arte dele foi copiado. O sistema foi escrito do zero, seguindo
o fluxo comum desse tipo de software de CFC (ficha → contrato → parcelas → baixa → recibo).
