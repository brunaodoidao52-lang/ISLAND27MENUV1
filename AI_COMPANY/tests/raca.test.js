'use strict';
/* Testes dos comandos fáceis (./raca): perguntas guiadas, atalhos e segurança das decisões. */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { spawnSync } = require('child_process');
const A = require('./apoio');

const RACA = path.join(__dirname, '..', 'raca.js');
let dados;
beforeEach(() => { dados = A.novoAmbiente(); });

function raca(args, entrada = '') {
  const r = spawnSync(process.execPath, [RACA, ...args], { input: entrada, encoding: 'utf8', env: Object.assign({}, process.env, { RACA_DADOS: dados }) });
  return { saida: r.stdout + r.stderr, codigo: r.status };
}
const tarefas = () => { A.registro.limparCache(); return A.tarefas.listar(); };

// Respostas na ordem das perguntas de "./raca ficha"
const RESPOSTAS_FICHA = [
  'Maria Souza', '111.111.111-11', '529.982.247-25', '', '', '', '',
  '2', '1', 'dois mil', '2.500,00', '', '500', '2', '4', '15/11/2026', 's'
].join('\n') + '\n';

test('ficha guiada: refaz a pergunta quando o dado está errado e envia ao CEO', () => {
  const r = raca(['ficha'], RESPOSTAS_FICHA);
  assert.match(r.saida, /CPF inválido/);
  assert.match(r.saida, /Valor inválido/);
  assert.match(r.saida, /HUMAN APPROVAL REQUIRED/);
  assert.match(r.saida, /Próximo passo: \.\/raca aprovar/);
  assert.equal(tarefas()[0].aprovacao.status, 'PENDENTE');
});

test('ficha guiada: responder "n" na confirmação não envia nada', () => {
  const r = raca(['ficha'], RESPOSTAS_FICHA.replace(/s\n$/, 'n\n'));
  assert.match(r.saida, /Nada foi enviado/);
  assert.equal(tarefas().length, 0);
});

test('aprovar sem resposta não decide nada; --ver só mostra; "sim" aprova e lança', () => {
  raca(['ficha', '--dados', 'Nome: João Pereira\\nCPF: 390.533.447-05\\nCategoria: A\\nServiço: Primeira habilitação\\nValor total: 1.200,00\\nParcelas: 2\\nPrimeiro vencimento: 10/12/2026']);
  const semResposta = raca(['aprovar', '1']);
  assert.match(semResposta.saida, /nada foi feito/);
  assert.equal(tarefas()[0].aprovacao.status, 'PENDENTE', 'continua pendente');
  const ver = raca(['aprovar', '1', '--ver']);
  assert.match(ver.saida, /Parcela 1\/2: R\$\s?600,00/);
  assert.equal(tarefas()[0].aprovacao.status, 'PENDENTE');
  const sim = raca(['aprovar', '1', 'sim', 'conferi']);
  assert.match(sim.saida, /concluída e validada/);
  assert.match(raca(['lancamentos']).saida, /João Pereira/);
});

test('completar: pergunta só o que faltou e a correção substitui o valor antigo', () => {
  raca(['ficha', '--dados', 'Nome: Ana Lima\\nCPF: 529.982.247-25\\nCategoria: B\\nServiço: Reciclagem\\nValor total: 600\\nParcelas: 1\\nPrimeiro vencimento: 31/02/2026']);
  const p = raca(['pendencias']);
  assert.match(p.saida, /Corrigir dados: Ana Lima/);
  assert.match(p.saida, /\.\/raca completar 1/);
  const r = raca(['completar', '1'], '30/02/2026\n10/03/2027\n');
  assert.match(r.saida, /Use dd\/mm\/aaaa/, 'data impossível recusada na hora');
  assert.match(r.saida, /HUMAN APPROVAL REQUIRED/);
  const entrada = tarefas()[0].entrada.dados;
  assert.equal((entrada.match(/Primeiro vencimento/g) || []).length, 1, 'linha antiga substituída');
  assert.match(entrada, /10\/03\/2027/);
});

test('resolver: tarefa parada por ferramenta volta a andar com "retomar"', () => {
  process.env.RACA_DADOS = dados;
  A.ferramentas.simularFalha('LIVRO_LANCAMENTOS');
  A.pedirFicha(A.FICHA_OK);
  A.ferramentas.simularFalha('LIVRO_LANCAMENTOS', false);
  assert.match(raca(['pendencias']).saida, /Parada: /);
  const r = raca(['resolver', '1', 'retomar', 'livro voltou']);
  assert.match(r.saida, /HUMAN APPROVAL REQUIRED/);
});

test('menu, status e ajuda funcionam e comando desconhecido explica o que existe', () => {
  assert.match(raca(['status']).saida, /Equipe:/);
  assert.match(raca([], '9\n').saida, /AUTO ESCOLA RAÇA/);
  const x = raca(['voar']);
  assert.match(x.saida, /Não conheço "voar"/);
  assert.equal(x.codigo, 1);
});
