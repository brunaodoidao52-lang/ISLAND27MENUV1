'use strict';
/*
 * Testes de cada agente nos 9 cenários pedidos:
 * entrada correta, incompleta, inválida, erro, duplicada, ambígua,
 * falta de permissão, falha de ferramenta e necessidade de aprovação.
 */
const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const A = require('./apoio');
const { tarefas, protocolo, executor, ferramentas, registro, memoria, politica, P, ficha, FICHA_OK } = A;

beforeEach(() => A.novoAmbiente());

const ultimaParaDono = () => A.caixaDono().slice(-1)[0];
const trocar = (texto, de, para) => texto.replace(de, para);

describe('CEO', () => {
  test('entrada correta: cria TASK_ID, escolhe o fluxo e delega ao CAPTADOR', () => {
    const r = A.pedirFicha(FICHA_OK);
    assert.match(r.task_id, /^TASK-\d{8}-\d{4}$/);
    assert.deepEqual(r.plano, ['captador', 'lancador']);
    const primeira = A.mensagens(r.task_id)[0];
    assert.equal(primeira.from_agent, 'ceo'); assert.equal(primeira.to_agent, 'captador'); assert.equal(primeira.action, 'DELEGATE');
  });
  test('entrada incompleta: pedido vazio é recusado sem criar tarefa', () => {
    assert.throws(() => executor.pedido({ texto: '' }), /pedido está vazio/);
    assert.equal(tarefas.listar().length, 0);
  });
  test('entrada inválida: prioridade e prazo inválidos são recusados', () => {
    assert.throws(() => A.pedirFicha(FICHA_OK, { prioridade: 'URGENTISSIMO' }), /Prioridade inválida/);
    assert.throws(() => A.pedirFicha(FICHA_OK, { prazo: 'amanhã cedo' }), /Prazo inválido/);
  });
  test('erro: erro HIGH de um especialista chega ao proprietário com pedido de intervenção', () => {
    ferramentas.simularFalha('LER_ENTRADA');
    const r = A.pedirFicha(FICHA_OK);
    const m = ultimaParaDono();
    assert.equal(m.task_id, r.task_id);
    assert.match(m.result.resumo, /intervenção humana/);
    assert.equal(m.errors[0].nivel, 'HIGH');
  });
  test('duplicada: o mesmo pedido não vira duas tarefas', () => {
    const a = A.pedirFicha(FICHA_OK);
    const b = A.pedirFicha(FICHA_OK);
    assert.equal(b.duplicada, true); assert.equal(b.task_id, a.task_id);
    assert.equal(tarefas.listar().length, 1);
    assert.match(ultimaParaDono().result.resumo, /já existe/);
  });
  test('ambígua: pedido sem agente capaz é bloqueado com "Não tenho dados suficientes."', () => {
    const r = executor.pedido({ texto: 'resolva aquilo lá' });
    assert.equal(r.bloqueada, true);
    assert.equal(tarefas.obter(r.task_id).status, 'BLOCKED');
    assert.match(ultimaParaDono().result.resumo, /Não tenho dados suficientes/);
    const r2 = executor.pedido({ texto: 'relatório de inadimplência do mês' });
    assert.match(r2.motivo, /não estão ativos/, 'agentes capazes existem, mas estão inativos');
  });
  test('falta de permissão: CEO não executa operações nem aprova no lugar do proprietário', () => {
    const r = A.pedirFicha(FICHA_OK);
    assert.throws(() => tarefas.executar(ficha('ceo'), r.task_id, { operacao: 'X' }, () => 1), /EXECUTE/);
    assert.throws(() => tarefas.decidirAprovacao(ficha('ceo'), r.task_id, true), /HUMAN_APPROVE/);
    assert.throws(() => registro.mudarStatusAgente('auditor', 'ACTIVE', 'ceo'), /Só o proprietário/);
  });
  test('falha de ferramenta: histórico indisponível é recusado e registrado', () => {
    ferramentas.simularFalha('LER_HISTORICO');
    const ctx = executor.contexto(ficha('ceo'));
    assert.throws(() => ctx.ferramenta('LER_HISTORICO'), e => e.codigo === 'FERRAMENTA_INDISPONIVEL');
    assert.ok(A.auditoria.listar().some(r => r.acao === 'FERRAMENTA_INDISPONIVEL'));
    assert.throws(() => ctx.ferramenta('LIVRO_LANCAMENTOS'), /não tem acesso/, 'ferramenta fora da ficha');
  });
  test('necessidade de aprovação: CEO avisa o proprietário e a tarefa aparece em "precisam de intervenção"', () => {
    const r = A.pedirFicha(FICHA_OK);
    assert.match(ultimaParaDono().result.resumo, /HUMAN APPROVAL REQUIRED/);
    const p = A.monitor.painel().perguntas['Quais tarefas precisam de intervenção?'];
    assert.deepEqual(p, [{ task_id: r.task_id, motivo: 'HUMAN APPROVAL REQUIRED' }]);
  });
});

describe('CAPTADOR', () => {
  test('entrada correta: estrutura a ficha e passa ao LANÇADOR com as fontes', () => {
    const r = A.pedirFicha(FICHA_OK);
    const handoff = A.mensagens(r.task_id).find(m => m.action === 'HANDOFF');
    assert.equal(handoff.from_agent, 'captador'); assert.equal(handoff.to_agent, 'lancador');
    assert.equal(handoff.input.ficha.cpf, '529.982.247-25');
    assert.equal(handoff.input.ficha.valor_total, 2500, '"2.500,00" lido como dois mil e quinhentos');
    assert.ok(handoff.input.fontes.length >= 5);
  });
  test('entrada incompleta: para (WAITING) e lista o que falta, sem inventar', () => {
    const r = A.pedirFicha('Nome: João Pereira\nValor total: 900');
    const t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'WAITING');
    const aviso = A.mensagens(r.task_id).find(m => m.action === 'STATUS_UPDATE' && m.from_agent === 'captador');
    assert.deepEqual(aviso.result.faltando.sort(), ['categoria', 'cpf', 'parcelas', 'primeiro_vencimento', 'servico'].sort());
    assert.ok(aviso.warnings[0].startsWith('Não tenho dados suficientes.'));
    assert.ok(!A.mensagens(r.task_id).some(m => m.action === 'HANDOFF'), 'nada foi passado adiante');
    // proprietário completa e o fluxo continua
    tarefas.complementar(P, r.task_id, 'CPF: 529.982.247-25\nCategoria: A\nServiço: Primeira habilitação\nParcelas: 1\nPrimeiro vencimento: 10/12/2026');
    executor.avisarCeo(r.task_id, { complemento: true });
    assert.equal(tarefas.obter(r.task_id).aprovacao.status, 'PENDENTE');
  });
  test('entrada inválida: CPF e data impossíveis viram erro MEDIUM com o motivo', () => {
    const r = A.pedirFicha(trocar(trocar(FICHA_OK, '529.982.247-25', '111.111.111-11'), '15/11/2026', '31/02/2026'));
    const t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'ERROR');
    const erro = A.mensagens(r.task_id).find(m => m.action === 'ERROR_REPORT');
    assert.deepEqual(erro.result.invalidos.map(i => i.campo).sort(), ['cpf', 'primeiro_vencimento']);
    assert.equal(erro.errors[0].nivel, 'MEDIUM');
  });
  test('erro: plano de pagamento incoerente é reportado, não corrigido', () => {
    const r = A.pedirFicha(trocar(FICHA_OK, 'Entrada: 500', 'Entrada: 3000'));
    const erro = A.mensagens(r.task_id).find(m => m.action === 'ERROR_REPORT');
    assert.match(erro.errors[0].descricao, /maior que o valor total/);
    assert.equal(A.livro().length, 0);
  });
  test('duplicada: DELEGATE reenviado (falha de comunicação) não é processado duas vezes', () => {
    const r = A.pedirFicha(FICHA_OK);
    const delegate = A.mensagens(r.task_id).find(m => m.action === 'DELEGATE');
    const reenvio = protocolo.enviar(Object.assign({}, delegate));
    assert.equal(reenvio.duplicada, true);
    executor.ciclo();
    assert.equal(A.mensagens(r.task_id).filter(m => m.action === 'HANDOFF').length, 1);
  });
  test('ambígua: categoria "carro" e CPF repetido com valores diferentes → "Necessário revisar."', () => {
    const r = A.pedirFicha(trocar(FICHA_OK, 'Categoria: B', 'Categoria: carro') + '\nCPF: 390.533.447-05');
    const aviso = A.mensagens(r.task_id).find(m => m.action === 'STATUS_UPDATE' && m.from_agent === 'captador');
    assert.equal(aviso.result.ambiguos[0].campo, 'categoria');
    assert.equal(aviso.result.conflitos[0].campo, 'cpf');
    assert.ok(aviso.warnings.some(w => w.startsWith('Necessário revisar.')));
  });
  test('falta de permissão: não executa, não usa skill fora da ficha e não delega', () => {
    const r = A.pedirFicha('Nome: João Pereira');
    const ctx = executor.contexto(ficha('captador'));
    assert.throws(() => tarefas.executar(ficha('captador'), r.task_id, { operacao: 'X' }, () => 1), /EXECUTE/);
    assert.throws(() => ctx.skill('auditing'), /não tem a skill/);
    assert.throws(() => ctx.enviar({ task_id: r.task_id, to_agent: 'lancador', action: 'DELEGATE' }), /DELEGATE/);
    assert.throws(() => memoria.gravarEstrategica(ficha('captador'), 'k', 'v', 'justificativa válida'), /Só o CEO/);
  });
  test('falha de ferramenta: LER_ENTRADA indisponível → ERROR HIGH, sem adivinhar dados', () => {
    ferramentas.simularFalha('LER_ENTRADA');
    const r = A.pedirFicha(FICHA_OK);
    const t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'ERROR');
    assert.equal(t.erros[0].origem, 'ferramenta');
    assert.ok(!A.mensagens(r.task_id).some(m => m.action === 'HANDOFF'));
  });
  test('necessidade de aprovação: CAPTADOR não lança nada; aprovação só é pedida na etapa do LANÇADOR', () => {
    const r = A.pedirFicha(FICHA_OK);
    const pedidoAprov = A.mensagens(r.task_id).find(m => m.action === 'REQUEST_APPROVAL');
    assert.equal(pedidoAprov.from_agent, 'lancador');
    assert.equal(A.livro().length, 0);
  });
});

describe('LANÇADOR', () => {
  test('entrada correta: após aprovação, lança uma vez e o CEO conclui', () => {
    const r = A.pedirFicha(FICHA_OK);
    A.aprovar(r.task_id);
    const t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'COMPLETED');
    assert.equal(A.livro().length, 1);
    const l = A.livro()[0];
    assert.equal(l.task_id, r.task_id);
    assert.equal(l.parcelas.reduce((s, p) => s + Math.round(p.valor * 100), 0), 250000);
    assert.equal(l.aprovado_por, P);
    assert.match(ultimaParaDono().result.resumo, /concluída e validada/);
  });
  test('entrada incompleta: passagem sem ficha registrada → erro, nada lançado', () => {
    const { tarefa } = tarefas.criar(ficha('ceo'), { titulo: 'lançar sem dados', tipo: 'LANCAR_FICHA', etapas: ['captador', 'lancador'] });
    tarefas.atribuir(ficha('ceo'), tarefa.task_id, 'captador');
    tarefas.iniciar(ficha('captador'), tarefa.task_id);
    tarefas.passar(ficha('captador'), tarefa.task_id, 'lancador', {});
    protocolo.enviar(protocolo.montar({ task_id: tarefa.task_id, from_agent: 'captador', to_agent: 'lancador', action: 'HANDOFF', status: 'ASSIGNED' }));
    executor.ciclo();
    const t = tarefas.obter(tarefa.task_id);
    assert.equal(t.status, 'ERROR');
    assert.match(t.erros[0].descricao, /não tem ficha registrada/);
    assert.equal(A.livro().length, 0);
  });
  test('entrada inválida: ficha sem vencimento chega por fora do CAPTADOR → erro do plano', () => {
    const { tarefa } = tarefas.criar(ficha('ceo'), { titulo: 'lançar ficha incompleta', tipo: 'LANCAR_FICHA', etapas: ['captador', 'lancador'] });
    tarefas.atribuir(ficha('ceo'), tarefa.task_id, 'captador');
    tarefas.iniciar(ficha('captador'), tarefa.task_id);
    const f = { nome: 'Ana Lima', cpf: '529.982.247-25', categoria: 'B', servico: 'Reciclagem', valor_total: 600, parcelas: 2 };
    tarefas.passar(ficha('captador'), tarefa.task_id, 'lancador', { ficha: f, fontes: [] });
    protocolo.enviar(protocolo.montar({ task_id: tarefa.task_id, from_agent: 'captador', to_agent: 'lancador', action: 'HANDOFF', status: 'ASSIGNED', input: { ficha: f } }));
    executor.ciclo();
    assert.match(tarefas.obter(tarefa.task_id).erros[0].descricao, /Primeiro vencimento/);
    assert.equal(A.livro().length, 0);
  });
  test('erro: livro falha na hora de gravar → erro registrado; depois de voltar, lança uma única vez', () => {
    const r = A.pedirFicha(FICHA_OK);
    ferramentas.simularFalha('LIVRO_LANCAMENTOS');
    A.aprovar(r.task_id);
    let t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'ERROR');
    assert.equal(A.livro().length, 0);
    assert.match(ultimaParaDono().result.resumo, /intervenção humana/);
    ferramentas.simularFalha('LIVRO_LANCAMENTOS', false);
    const rodada = tarefas.retomar(P, r.task_id, 'livro voltou');
    executor.avisarCeo(r.task_id, { retomar: true, rodada });
    t = tarefas.obter(r.task_id);
    assert.equal(A.livro().length, 1);
    assert.equal(t.status, 'COMPLETED');
  });
  test('duplicada: mesmo aluno, serviço e categoria em outro pedido → recusado', () => {
    const r1 = A.pedirFicha(FICHA_OK);
    A.aprovar(r1.task_id);
    const r2 = executor.pedido({ texto: 'Lançar ficha de novo (outro pedido)', tipo: 'LANCAR_FICHA', dados: FICHA_OK });
    const t = tarefas.obter(r2.task_id);
    assert.equal(t.status, 'ERROR');
    assert.match(t.erros[0].descricao, /Já existe o lançamento nº 1/);
    assert.equal(A.livro().length, 1);
  });
  test('ambígua: aprovação reenviada duas vezes não lança duas vezes', () => {
    const r = A.pedirFicha(FICHA_OK);
    A.aprovar(r.task_id);
    executor.avisarCeo(r.task_id, { aprovacao: 'APROVADA' }); // reenvio
    assert.equal(A.livro().length, 1);
  });
  test('falta de permissão: não delega, não fala com o CAPTADOR e não grava memória estratégica', () => {
    const r = A.pedirFicha(FICHA_OK);
    assert.throws(() => tarefas.atribuir(ficha('lancador'), r.task_id, 'captador'), /DELEGATE/);
    assert.throws(() => executor.contexto(ficha('lancador')).enviar({ task_id: r.task_id, to_agent: 'captador', action: 'STATUS_UPDATE' }), /canal/);
    assert.throws(() => memoria.gravarEstrategica(ficha('lancador'), 'k', 'v', 'justificativa válida'), /Só o CEO/);
  });
  test('falha de ferramenta: livro indisponível na conferência de duplicidade → ERROR HIGH', () => {
    ferramentas.simularFalha('LIVRO_LANCAMENTOS');
    const r = A.pedirFicha(FICHA_OK);
    const t = tarefas.obter(r.task_id);
    assert.equal(t.status, 'ERROR');
    assert.equal(t.erros[0].nivel, 'HIGH');
    assert.equal(t.aprovacao.status, 'NAO_SOLICITADA', 'não pede aprovação sem conseguir conferir duplicidade');
  });
  test('necessidade de aprovação: para antes de lançar; negada → BLOCKED e nada lançado', () => {
    const r = A.pedirFicha(FICHA_OK);
    assert.equal(tarefas.obter(r.task_id).status, 'WAITING');
    assert.equal(A.livro().length, 0);
    A.negar(r.task_id);
    assert.equal(tarefas.obter(r.task_id).status, 'BLOCKED');
    assert.equal(A.livro().length, 0);
    assert.match(ultimaParaDono().result.resumo, /negada/);
  });
});
