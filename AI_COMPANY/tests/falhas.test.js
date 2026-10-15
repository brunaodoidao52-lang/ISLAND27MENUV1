'use strict';
/*
 * TESTE DE FALHA — o sistema precisa identificar e reportar:
 * CAPTADOR falhando, LANÇADOR falhando, CEO recebendo informação incompleta,
 * tarefa duplicada, agente sem permissão, ferramenta indisponível, dados contraditórios.
 */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./apoio');
const { tarefas, protocolo, executor, ferramentas, registro, monitor, P, ficha, FICHA_OK } = A;

beforeEach(() => A.novoAmbiente());

test('CAPTADOR falhando (erro inesperado): erro registrado, CEO avisado, proprietário informado, painel acusa', () => {
  executor.registrarHandlerDeTeste('captador', { processar() { throw new Error('falha inesperada no captador'); } });
  const r = A.pedirFicha(FICHA_OK);
  const t = tarefas.obter(r.task_id);
  assert.equal(t.status, 'ERROR');
  assert.equal(t.erros[0].descricao, 'falha inesperada no captador');
  assert.ok(A.mensagens(r.task_id).some(m => m.from_agent === 'captador' && m.action === 'ERROR_REPORT'));
  assert.ok(A.caixaDono().some(m => m.task_id === r.task_id && m.errors.length));
  assert.equal(registro.linhaRegistro('captador').tasks_failed, 1);
  assert.ok(monitor.painel().perguntas['Qual agente está apresentando erros?'].includes('captador'));
});

test('LANÇADOR falhando com erro CRITICAL: agente vai para ERROR e não recebe novas tarefas até o proprietário liberar', () => {
  executor.registrarHandlerDeTeste('lancador', { processar() { throw Object.assign(new Error('estado corrompido'), { nivel: 'CRITICAL', codigo: 'CORRUPCAO' }); } });
  const r = A.pedirFicha(FICHA_OK);
  assert.equal(registro.statusAgente('lancador'), 'ERROR');
  assert.equal(tarefas.obter(r.task_id).erros[0].intervencao_humana, true);
  executor.registrarHandlerDeTeste('lancador', null);
  const r2 = executor.pedido({ texto: 'Lançar ficha de outro aluno', tipo: 'LANCAR_FICHA', dados: FICHA_OK.replace('Maria Souza', 'Paula Dias') });
  assert.equal(tarefas.obter(r2.task_id).status, 'ERROR');
  assert.match(tarefas.obter(r2.task_id).erros[0].descricao, /lancador está ERROR/);
  registro.mudarStatusAgente('lancador', 'ACTIVE', P, 'causa resolvida');
  assert.equal(registro.statusAgente('lancador'), 'ACTIVE');
});

test('CEO recebendo informação incompleta: resultado sem confirmação de qualidade volta para correção', () => {
  executor.registrarHandlerDeTeste('lancador', {
    processar(msg, ctx) {
      if (msg.action !== 'HANDOFF') return;
      ctx.tarefas.iniciar(msg.task_id);
      const q = { objetivo_cumprido: true, dados_completos: false, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: false, pode_concluir: false };
      ctx.tarefas.enviarRevisao(msg.task_id, { limitacoes: ['faltou conferir'] }, q);
      ctx.enviar({ task_id: msg.task_id, to_agent: 'ceo', action: 'RESULT', result: { lancamento: 99 } });
    }
  });
  const r = A.pedirFicha(FICHA_OK);
  const t = tarefas.obter(r.task_id);
  assert.notEqual(t.status, 'COMPLETED');
  const correcao = A.mensagens(r.task_id).find(m => m.action === 'REQUEST_CORRECTION');
  assert.ok(correcao.input.correcoes.some(c => /Os dados estão completos/.test(c)));
  assert.ok(correcao.input.correcoes.some(c => /não há execução LANCAR_FICHA registrada/.test(c)), 'e também acusa a falta de execução');
});

test('CEO não entra em laço: depois de 2 correções sem sucesso, bloqueia e avisa o proprietário', () => {
  executor.registrarHandlerDeTeste('lancador', {
    processar(msg, ctx) {
      if (!['HANDOFF', 'REQUEST_CORRECTION'].includes(msg.action)) return;
      if (ctx.tarefa(msg.task_id).status === 'ASSIGNED') ctx.tarefas.iniciar(msg.task_id);
      const sim = { objetivo_cumprido: true, dados_completos: true, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true };
      ctx.tarefas.enviarRevisao(msg.task_id, { fontes: ['x'] }, sim);
      ctx.enviar({ task_id: msg.task_id, to_agent: 'ceo', action: 'RESULT', result: { lancamento: 1, rodada: Math.random() } });
    }
  });
  const r = A.pedirFicha(FICHA_OK);
  const t = tarefas.obter(r.task_id);
  assert.equal(t.status, 'BLOCKED');
  assert.equal(A.mensagens(r.task_id).filter(m => m.action === 'REQUEST_CORRECTION').length, 2);
  assert.ok(A.caixaDono().some(m => /não conseguiu corrigir/.test(m.result.resumo)));
  assert.ok(!A.auditoria.listar().some(x => x.acao === 'LIMITE_DE_CICLO'), 'parou por regra, não pelo limite de segurança');
});

test('CEO não aceita "lançado" sem execução registrada (não acredita só na mensagem)', () => {
  executor.registrarHandlerDeTeste('lancador', {
    processar(msg, ctx) {
      if (msg.action !== 'HANDOFF') return;
      ctx.tarefas.iniciar(msg.task_id);
      const sim = { objetivo_cumprido: true, dados_completos: true, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true };
      ctx.tarefas.enviarRevisao(msg.task_id, { lancamento: 1, fontes: ['inventado'] }, sim);
      ctx.enviar({ task_id: msg.task_id, to_agent: 'ceo', action: 'RESULT', result: { lancamento: 1 } });
    }
  });
  const r = A.pedirFicha(FICHA_OK);
  assert.notEqual(tarefas.obter(r.task_id).status, 'COMPLETED');
  const correcao = A.mensagens(r.task_id).find(m => m.action === 'REQUEST_CORRECTION');
  assert.match(correcao.input.correcoes[0], /não há execução LANCAR_FICHA registrada/);
});

test('tarefa duplicada: pedido repetido e operação crítica repetida são barrados', () => {
  const r = A.pedirFicha(FICHA_OK);
  assert.equal(A.pedirFicha(FICHA_OK).duplicada, true);
  A.aprovar(r.task_id);
  // "falha de comunicação": o LANÇADOR é acionado de novo para a mesma operação
  const ctx = executor.contexto(ficha('lancador'));
  assert.throws(() => ctx.tarefas.executar(r.task_id, { operacao: 'LANCAR_FICHA' }, () => 'de novo'), /não é o responsável|TRANSICAO|em andamento/);
  assert.equal(A.livro().length, 1);
  assert.equal(A.monitor.painel().sistema.inconsistencias.length, 0);
});

test('agente sem permissão: toda tentativa é recusada e registrada no log', () => {
  const r = A.pedirFicha(FICHA_OK);
  assert.throws(() => tarefas.criar(ficha('captador'), { titulo: 'criar por conta própria' }), e => e.codigo === 'SEM_PERMISSAO');
  assert.throws(() => tarefas.validar(ficha('lancador'), r.task_id), e => e.codigo === 'SEM_PERMISSAO');
  assert.throws(() => tarefas.decidirAprovacao(ficha('lancador'), r.task_id, true), e => e.codigo === 'SEM_PERMISSAO');
  assert.throws(() => executor.contexto(ficha('captador')).ferramenta('LIVRO_LANCAMENTOS'), /não tem acesso/);
  assert.throws(() => protocolo.enviar(protocolo.montar({ task_id: r.task_id, from_agent: 'captador', to_agent: 'ceo', action: 'VALIDATE', status: 'WAITING' })), /não usa a ação VALIDATE|APPROVE/);
  assert.ok(A.auditoria.listar().some(x => x.acao === 'MENSAGEM_RECUSADA'));
});

test('ferramenta indisponível: identificada, registrada e reportada (sem inventar resultado)', () => {
  ferramentas.simularFalha('LER_ENTRADA');
  const r = A.pedirFicha(FICHA_OK);
  const t = tarefas.obter(r.task_id);
  assert.equal(t.erros[0].causa, 'FERRAMENTA_INDISPONIVEL');
  assert.ok(A.auditoria.listar().some(x => x.acao === 'FERRAMENTA_INDISPONIVEL'));
  assert.ok(!A.mensagens(r.task_id).some(m => m.action === 'HANDOFF' || m.action === 'RESULT'));
});

test('dados contraditórios: mensagem diz uma ficha e o registro outra → CRITICAL, nada lançado', () => {
  executor.registrarHandlerDeTeste('captador', {
    processar(msg, ctx) {
      if (msg.action !== 'DELEGATE') return;
      ctx.tarefas.iniciar(msg.task_id);
      const registrada = { nome: 'Maria Souza', cpf: '529.982.247-25', categoria: 'B', servico: 'Primeira habilitação', valor_total: 2500, parcelas: 1, primeiro_vencimento: '2026-11-15' };
      ctx.tarefas.passar(msg.task_id, 'lancador', { ficha: registrada, fontes: ['entrada'] });
      ctx.enviar({ task_id: msg.task_id, to_agent: 'lancador', action: 'HANDOFF', input: { ficha: Object.assign({}, registrada, { valor_total: 250 }) } });
    }
  });
  const r = A.pedirFicha(FICHA_OK);
  const t = tarefas.obter(r.task_id);
  assert.equal(t.erros[0].nivel, 'CRITICAL');
  assert.match(t.erros[0].descricao, /diferente da ficha registrada/);
  assert.equal(A.livro().length, 0);
  assert.ok(A.caixaDono().some(m => m.task_id === r.task_id && /intervenção humana/.test(m.result.resumo)));
});

test('log continua íntegro e completo depois de todas as falhas', () => {
  ferramentas.simularFalha('LIVRO_LANCAMENTOS');
  const r = A.pedirFicha(FICHA_OK);
  ferramentas.simularFalha('LIVRO_LANCAMENTOS', false);
  const rodada = tarefas.retomar(P, r.task_id, 'livro voltou');
  executor.avisarCeo(r.task_id, { retomar: true, rodada });
  A.aprovar(r.task_id);
  const acoes = A.acoesLog(r.task_id);
  ['CRIAR_TAREFA', 'DELEGAR', 'HANDOFF', 'ERRO', 'RETOMAR', 'HUMAN_APPROVAL_REQUIRED', 'APROVACAO_CONCEDIDA', 'EXECUCAO_OK', 'VALIDAR'].forEach(a => assert.ok(acoes.includes(a), a));
  assert.ok(acoes.indexOf('ERRO') < acoes.indexOf('EXECUCAO_OK'), 'o erro anterior continua no histórico após a correção');
  assert.equal(A.auditoria.verificar().ok, true);
  assert.equal(tarefas.obter(r.task_id).status, 'COMPLETED');
});
