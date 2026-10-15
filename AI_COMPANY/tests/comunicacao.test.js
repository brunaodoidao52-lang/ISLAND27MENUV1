'use strict';
/*
 * TESTE DE COMUNICAÇÃO — verifica que o TASK_ID permanece, que as
 * informações não se perdem, que os erros são transmitidos e que o status é atualizado.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./apoio');
const { tarefas, protocolo, executor, registro, P, FICHA_OK } = A;

beforeEach(() => A.novoAmbiente());

const par = m => `${m.from_agent}->${m.to_agent}:${m.action}`;

test('CEO → CAPTADOR → LANÇADOR → CEO: mesmo TASK_ID, dados completos e status atualizado', () => {
  const r = A.pedirFicha(FICHA_OK);
  A.aprovar(r.task_id);
  const msgs = A.mensagens(r.task_id);
  assert.ok(msgs.every(m => m.task_id === r.task_id), 'TASK_ID permanece em todas as mensagens');
  const pares = msgs.map(par);
  ['ceo->captador:DELEGATE', 'captador->lancador:HANDOFF', 'lancador->ceo:REQUEST_APPROVAL', 'lancador->ceo:RESULT', 'ceo->proprietario:REPORT']
    .forEach(p => assert.ok(pares.includes(p), `faltou ${p}`));
  const status = Object.fromEntries(msgs.map(m => [par(m), m.status]));
  assert.equal(status['ceo->captador:DELEGATE'], 'ASSIGNED');
  assert.equal(status['captador->lancador:HANDOFF'], 'ASSIGNED');
  assert.equal(status['lancador->ceo:REQUEST_APPROVAL'], 'WAITING');
  assert.equal(status['lancador->ceo:RESULT'], 'REVIEW');
  // Informação não se perde: a ficha que saiu do CAPTADOR é a mesma que foi lançada.
  const handoff = msgs.find(m => m.action === 'HANDOFF');
  assert.deepEqual(A.livro()[0].ficha, handoff.input.ficha);
  const resultado = msgs.find(m => m.action === 'RESULT');
  assert.equal(resultado.result.lancamento, A.livro()[0].numero);
  assert.equal(tarefas.obter(r.task_id).status, 'COMPLETED');
});

test('erro do CAPTADOR é transmitido ao CEO e do CEO ao proprietário, com o mesmo TASK_ID', () => {
  const r = A.pedirFicha(FICHA_OK.replace('529.982.247-25', '123.456.789-00'));
  const erroCap = A.mensagens(r.task_id).find(m => m.action === 'ERROR_REPORT');
  const aoDono = A.mensagens(r.task_id).find(m => m.to_agent === P && m.errors.length);
  assert.equal(erroCap.task_id, r.task_id);
  assert.deepEqual(aoDono.errors, erroCap.errors, 'o erro chega inteiro ao proprietário');
});

for (const agente of ['auditor', 'financeiro', 'comercial']) {
  const pedidos = { auditor: 'fazer auditoria de duplicidade', financeiro: 'relatório financeiro de contas a receber', comercial: 'acompanhar lead novo e negociação' };
  test(`CEO → ${agente.toUpperCase()}: inativo é recusado com motivo; ativo recebe e devolve sem perder dados`, () => {
    // Preparado e inativo: o CEO não delega e explica por quê.
    const r0 = executor.pedido({ texto: pedidos[agente] });
    assert.equal(r0.bloqueada, true);
    assert.match(r0.motivo, new RegExp(`${agente}: INACTIVE`));
    assert.throws(() => protocolo.enviar(protocolo.montar({ task_id: r0.task_id, from_agent: 'ceo', to_agent: agente, action: 'DELEGATE', status: 'BLOCKED' })), /está INACTIVE/);
    // Ativado (com implementação de teste): comunicação completa.
    A.ativarComStub(agente);
    const r = executor.pedido({ texto: `${pedidos[agente]} (de novo)` });
    const msgs = A.mensagens(r.task_id);
    const ida = msgs.find(m => m.action === 'DELEGATE');
    const volta = msgs.find(m => m.from_agent === agente);
    assert.equal(ida.to_agent, agente);
    assert.equal(volta.task_id, r.task_id, 'TASK_ID permanece');
    assert.deepEqual(volta.result.recebido, ida.input, 'informação não se perdeu');
    assert.equal(volta.status, 'REVIEW');
    assert.equal(tarefas.obter(r.task_id).status, 'COMPLETED', 'status atualizado até o fim');
    assert.ok(A.caixaDono().some(m => m.task_id === r.task_id && /concluída e validada/.test(m.result.resumo)));
  });
}

test('CEO → COMERCIAL com falha: o erro volta ao CEO e chega ao proprietário', () => {
  A.ativarComStub('comercial', 'erro');
  const r = executor.pedido({ texto: 'acompanhar lead e venda' });
  const aoDono = A.caixaDono().find(m => m.task_id === r.task_id && m.errors.length);
  assert.match(aoDono.errors[0].descricao, /comercial não conseguiu concluir/);
  assert.equal(tarefas.obter(r.task_id).status, 'ERROR');
});

test('protocolo: recusa campo faltando, campo extra, TASK_ID fora do formato ou trocado e canal inexistente', () => {
  const r = A.pedirFicha(FICHA_OK);
  const base = protocolo.montar({ task_id: r.task_id, from_agent: 'ceo', to_agent: 'captador', action: 'STATUS_UPDATE', status: 'WAITING' });
  const sem = Object.assign({}, base); delete sem.warnings;
  assert.throws(() => protocolo.enviar(sem), /campo ausente: warnings/);
  assert.throws(() => protocolo.enviar(Object.assign({}, base, { extra: 1 })), /não previsto/);
  assert.throws(() => protocolo.enviar(Object.assign({}, base, { task_id: 'TAREFA-1' })), /fora do formato/);
  assert.throws(() => protocolo.enviar(Object.assign({}, base, { input: { task_id: 'TASK-20990101-0001' } })), /diferente do task_id/);
  assert.throws(() => protocolo.enviar(Object.assign({}, base, { from_agent: 'lancador', to_agent: 'captador' })), /não tem canal/);
  assert.throws(() => protocolo.enviar(Object.assign({}, base, { task_id: 'TASK-20990101-0099' })), /tarefa inexistente/);
  assert.ok(A.auditoria.listar().filter(x => x.acao === 'MENSAGEM_RECUSADA').length >= 6, 'toda recusa vai para o log');
});

test('agente pausado: a mensagem espera na caixa e é entregue quando volta', () => {
  registro.mudarStatusAgente('lancador', 'PAUSED', P, 'manutenção');
  const r = A.pedirFicha(FICHA_OK);
  // CAPTADOR não consegue passar para um agente pausado: erro registrado e reportado
  assert.equal(tarefas.obter(r.task_id).status, 'ERROR');
  assert.match(tarefas.obter(r.task_id).erros[0].descricao, /lancador está PAUSED/);
  registro.mudarStatusAgente('lancador', 'ACTIVE', P, 'voltou');
  const rodada = tarefas.retomar(P, r.task_id, 'lançador ativo de novo');
  executor.avisarCeo(r.task_id, { retomar: true, rodada });
  assert.equal(tarefas.obter(r.task_id).aprovacao.status, 'PENDENTE', 'fluxo retomado até a aprovação');
});
