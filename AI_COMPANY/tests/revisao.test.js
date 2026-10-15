'use strict';
/* Regressões dos achados da revisão adversarial (um teste por achado). */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('./apoio');
const { tarefas, executor, ferramentas, registro, auditoria, P, ficha, FICHA_OK } = A;

beforeEach(() => A.novoAmbiente());

test('negar → complementar → nova rodada não trava (repetição legítima não é descartada)', () => {
  const r = A.pedirFicha(FICHA_OK);
  A.negar(r.task_id);
  tarefas.complementar(P, r.task_id, 'Observação: conferir RG');
  executor.avisarCeo(r.task_id, { complemento: true });
  const t = tarefas.obter(r.task_id);
  assert.equal(t.aprovacao.status, 'PENDENTE', 'chegou de novo ao pedido de aprovação');
  assert.ok(A.caixaDono().filter(m => m.task_id === r.task_id && /HUMAN APPROVAL REQUIRED/.test(m.result.resumo)).length >= 2, 'proprietário avisado de novo');
});

test('falha DEPOIS de gravar não libera repetição: execução incerta bloqueia até o proprietário confirmar', () => {
  const r = A.pedirFicha(FICHA_OK);
  // o livro grava e logo em seguida "cai"
  const livroTool = require('../orchestration/ferramentas');
  const original = livroTool.obter;
  livroTool.obter = (f, nome, ctx) => {
    const tool = original(f, nome, ctx);
    if (nome !== 'LIVRO_LANCAMENTOS') return tool;
    return Object.assign({}, tool, { gravar: l => { tool.gravar(l); throw new Error('queda logo após gravar'); } });
  };
  try { A.aprovar(r.task_id); } finally { livroTool.obter = original; }
  let t = tarefas.obter(r.task_id);
  assert.equal(t.status, 'BLOCKED');
  assert.equal(t.execucoes.find(e => e.operacao === 'LANCAR_FICHA').status, 'INCERTA');
  assert.equal(A.livro().length, 1);
  assert.throws(() => tarefas.retomar(P, r.task_id, 'tentar de novo'), /execução incerta/);
  tarefas.confirmarExecucao(P, r.task_id, true, 'vi o lançamento no livro');
  const rodada = tarefas.retomar(P, r.task_id, 'confirmado');
  executor.avisarCeo(r.task_id, { retomar: true, rodada });
  t = tarefas.obter(r.task_id);
  assert.equal(A.livro().length, 1, 'não lançou de novo');
  assert.equal(t.status, 'COMPLETED', 'fluxo termina normalmente após a confirmação');
});

test('a aprovação cobre os dados exatos e vale para uma única execução', () => {
  const r = A.pedirFicha(FICHA_OK);
  const pedido = tarefas.obter(r.task_id).aprovacao;
  assert.ok(pedido.dados && pedido.dados.parcelas.length === 5, 'o proprietário vê as parcelas que serão gravadas');
  A.aprovar(r.task_id);
  const l = A.livro()[0];
  assert.deepEqual(l.parcelas, pedido.dados.parcelas, 'gravado exatamente o que foi aprovado');
  assert.ok(tarefas.obter(r.task_id).aprovacao.consumida, 'aprovação consumida');
});

test('handler não consegue se dar permissões mexendo na própria ficha', () => {
  const ctx = executor.contexto(ficha('captador'));
  assert.throws(() => ctx.ficha.PERMISSIONS.push('EXECUTE'));
  assert.throws(() => { ctx.ficha.TOOLS[0] = 'LIVRO_LANCAMENTOS'; });
  assert.doesNotThrow(() => registro.registro(), 'registro continua íntegro');
});

test('agente não lê a entrada (CPF) de tarefa alheia nem registra erro nela', () => {
  const r = A.pedirFicha(FICHA_OK); // fica com o LANÇADOR, esperando aprovação
  const vista = executor.contexto(ficha('captador')).tarefa(r.task_id);
  assert.equal(vista.entrada, undefined);
  assert.throws(() => tarefas.registrarErro(ficha('captador'), r.task_id, { nivel: 'LOW', descricao: 'x', causa: 'y' }), /não está com ele/);
  assert.equal(tarefas.obter(r.task_id).status, 'WAITING');
});

test('log: apagar registros do final é detectado; linha cortada não trava o sistema', () => {
  A.pedirFicha(FICHA_OK);
  const arq = path.join(process.env.RACA_DADOS, 'logs/dados/auditoria.jsonl');
  const original = fs.readFileSync(arq, 'utf8');
  const linhas = original.trim().split('\n');
  fs.writeFileSync(arq, linhas.slice(0, -5).join('\n') + '\n');
  assert.equal(auditoria.verificar().ok, false);
  assert.match(auditoria.verificar().problemas.join(' '), /apagados do final/);
  fs.writeFileSync(arq, original + '{"seq":99,"horario":"2026');
  assert.doesNotThrow(() => auditoria.registrar({ agente: 'sistema', acao: 'DEPOIS_DA_QUEDA' }));
  const v = auditoria.verificar();
  assert.match(v.problemas.join(' '), /cortada/);
  assert.ok(auditoria.listar().some(x => x.acao === 'DEPOIS_DA_QUEDA'));
});

test('erro em tarefa finalizada só vai para o log (não reabre nem põe agente em ERROR)', () => {
  const r = A.pedirFicha(FICHA_OK);
  A.aprovar(r.task_id);
  assert.equal(tarefas.registrarErro(ficha('ceo'), r.task_id, { nivel: 'CRITICAL', descricao: 'tarde', causa: 'teste' }), null);
  assert.equal(tarefas.obter(r.task_id).erros.length, 0);
  assert.ok(A.acoesLog(r.task_id).includes('ERRO_APOS_FIM'));
});

test('execução interrompida por queda do processo é bloqueada e o proprietário é avisado', () => {
  const r = A.pedirFicha(FICHA_OK);
  tarefas.decidirAprovacao(P, r.task_id, true, 'ok');
  tarefas.iniciar(ficha('lancador'), r.task_id);
  A.armazem.comTrava(() => {
    const todas = A.armazem.lerJSON('tasks/dados/tarefas.json');
    todas[r.task_id].execucoes.push({ chave: 'x', operacao: 'LANCAR_FICHA', status: 'INICIADA', em: '2026-01-01T00:00:00.000Z' });
    A.armazem.gravarJSON('tasks/dados/tarefas.json', todas);
  });
  executor.ciclo();
  assert.equal(tarefas.obter(r.task_id).status, 'BLOCKED');
  assert.ok(A.caixaDono().some(m => m.task_id === r.task_id && /começou e não terminou/.test(m.result.resumo)));
});

test('CLI: "complementar TASK Parcelas: 4" sem aspas não perde o valor', () => {
  const r = A.pedirFicha(FICHA_OK.replace('Parcelas: 4\n', ''));
  require('../empresa').main(['complementar', r.task_id, 'Parcelas:', '4']);
  assert.match(tarefas.obter(r.task_id).entrada.dados, /Parcelas: 4/);
});
