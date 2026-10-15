# ISLAND27 CFC — gestão de fichas e pagamentos

Sistema simples para autoescola (CFC), inspirado no funcionamento de sistemas como o
CFC Produtivo, com as cores da ISLAND27. Foca em três coisas:

1. **Lançar fichas** dos alunos (dados pessoais + contrato com entrada e parcelas)
2. **Pagamentos realizados** (o que já entrou, com recibo)
3. **Pagamentos pendentes** (o que falta receber, com atrasados e cobrança pelo WhatsApp)

## Como abrir

- **Pelo link publicado (recomendado):** funciona no celular e no PC. Os dados ficam numa área
  privada da sua conta Claude e o celular e o PC se sincronizam sozinhos.
- **Como arquivo:** abra `index.html` no navegador. Os dados ficam só naquele navegador.

Para testar com dados prontos: **Configurações → Carregar dados de exemplo** (os alunos
aparecem marcados como "(exemplo)"; depois use **Apagar tudo**).

## Segurança

| Proteção | Como funciona |
|---|---|
| Senha com criptografia | Em **Configurações → Criar senha**, tudo passa a ser guardado criptografado (AES-256-GCM, chave derivada da senha com PBKDF2-SHA256 de 600 mil iterações). A senha nunca é salva. **Se esquecer a senha, os dados não podem ser recuperados** — guarde uma cópia de segurança. |
| Bloqueio automático | Com senha, o sistema se fecha depois de 15 min sem uso (ajustável) e apaga os dados da memória. |
| Tentativas de senha | Depois de 5 senhas erradas, impõe espera crescente (30 s, 1 min, 2 min…). |
| Área privada na nuvem | No link publicado, cada pessoa só enxerga a própria área; quem receber o link não vê as suas fichas. |
| Proteção contra injeção de código | Tudo que é digitado ou vem de backup é validado (tipo, tamanho, listas fixas) e escapado antes de aparecer na tela. A versão de arquivo também usa CSP, que bloqueia qualquer script que não seja do próprio sistema. |
| Backup seguro | Com senha, a cópia baixada também sai criptografada. Arquivos adulterados, de outro sistema ou gigantes são recusados. |
| Celular e PC juntos | Lançamentos feitos ao mesmo tempo nos dois aparelhos são somados, nenhum se perde, e uma ficha apagada não "volta". |
| Proteção contra erros | Confirmação antes de excluir/estornar, "Apagar tudo" exige digitar APAGAR, toque duplo não registra pagamento duas vezes, valores em centavos (sem erro de arredondamento). |

Os testes automáticos que comprovam isso estão em [`testes/`](testes/README.md) (106 verificações).

## Como usar no dia a dia

| Quero… | Onde |
|---|---|
| Cadastrar um aluno novo | **Lançar ficha** → preencher → *Salvar ficha*. As parcelas são criadas sozinhas. |
| Registrar que o aluno pagou | **Pagamentos pendentes** (ou na ficha) → *Receber*. Pagou menos? O restante continua pendente. |
| Dar recibo | Botão *Recibo*: copiar, mandar no WhatsApp ou imprimir/baixar (duas vias: aluno e CFC). |
| Cobrar quem está atrasado | **Pagamentos pendentes** → *Mostrar: Atrasadas* → *WhatsApp* (mensagem pronta). |
| Lançar aula extra / taxa | Abrir a ficha → *Nova cobrança*. |
| Ver quanto entrou no mês | **Pagamentos realizados** (total e por forma de pagamento). |
| Corrigir um pagamento lançado errado | *Estornar* — a parcela volta a ficar pendente. |

## Como mexer no código

Tudo é HTML, CSS e JavaScript puro, separado por assunto:

| Arquivo | O que tem |
|---|---|
| `styles.css` | Visual. **As cores ficam no topo** (`:root`) — troque ali para mudar o tema inteiro. |
| `js/dados.js` | Regras: geração de parcelas, validação dos dados, listas de serviços/categorias/formas de pagamento. |
| `js/cofre.js` | Onde os dados são salvos (navegador ou nuvem), criptografia e sincronização. |
| `js/seguranca.js` | Tela de senha, bloqueio automático e limite de tentativas. |
| `js/fichas.js` | Lista, formulário e tela da ficha do aluno (e impressão da ficha). |
| `js/pagamentos.js` | Pagamentos realizados, pendentes, receber, estornar e recibo. |
| `js/inicio.js` | Painel inicial com o resumo. |
| `js/config.js` | Dados da autoescola, backup e dados de exemplo. |
| `js/app.js` | Liga o menu às telas e inicia o sistema. |
| `ferramentas/gerar_publicacao.py` | Junta tudo num arquivo só (`dist/`) para publicar o link. |

Para adicionar um serviço, categoria ou forma de pagamento, edite as listas
`SERVICOS`, `CATEGORIAS`, `FORMAS` e `STATUS` no começo de `js/dados.js`.

## Cores ISLAND27

Fundo `#08090C` / `#0C0E13`, painéis `#14161C`, ciano `#7FE3FF`, azul `#2AA9E0`,
marinho `#12213F`, texto `#F2F4F8`; fontes Space Grotesk (títulos) e IBM Plex Sans (texto).
Verde, amarelo e vermelho suaves foram acrescentados só para indicar pago / vence hoje / atrasado.

## Sobre a referência

O site cfcprodutivo.com.br não pôde ser acessado a partir do ambiente onde este sistema foi
feito, então nenhum código ou arte dele foi copiado. O sistema foi escrito do zero, seguindo
o fluxo comum desse tipo de software de CFC (ficha → contrato → parcelas → baixa → recibo).
