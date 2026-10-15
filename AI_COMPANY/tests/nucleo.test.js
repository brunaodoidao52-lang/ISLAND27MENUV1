'use strict';
/* Testes do núcleo: TASK_ID, status, aprovação, execução única, auditoria, memória, registro, versões, prioridade, balanceamento, monitoramento. */
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const A = require('./apoio');
const { tarefas, registro, auditoria, memoria, politica, monitor, P, ficha } = A;
const gestao = require('../skills/task_management');

beforeEach(() => A.novoAmbiente());

const nova = (titulo, extra = {}) => tarefas.criar(ficha('ceo'), Object.assign({ titulo }, extra)).tarefa;

test('TASK_ID no formato TASK-AAAAMMDD-XXXX, único e sequencial', () => {
  const ids = Array.from({ length: 25 }, (_, i) => nova(`tarefa ${i}`).task_id);
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}${String(hoje.getMonth() + 1).padStart(2, '0')}${String(hoje.getDate()).padStart(2, '0')}`;
  ids.forEach((id, i) => assert.equal(id, `TASK-${dia}-${String(i + 1).padStart(4, '0')}`));
  assert.equal(new Set(ids).size, 25);
});

test('status só muda pelos caminhos permitidos; COMPLETED só pela validação', () => {
  const t = nova('organizar arquivo');
  assert.throws(() => tarefas.mover(ficha('ceo'), t.task_id, 'REVIEW'), /não permitida/);
  assert.throws(() => tarefas.mover(ficha('ceo'), t.task_id, 'COMPLETED'), /validação do CEO/);
  tarefas.mover(ficha('ceo'), t.task_id, 'CANCELLED', 'teste');
  assert.throws(() => tarefas.mover(ficha('ceo'), t.task_id, 'PENDING'), /não permitida/);
  assert.ok(tarefas.obter(t.task_id).historico.length >= 2, 'histórico guardado');
});

test('validação exige as 7 respostas de qualidade e fundamento', () => {
  const t = nova('tarefa geral', { etapas: ['captador'] });
  tarefas.atribuir(ficha('ceo'), t.task_id, 'captador');
  tarefas.iniciar(ficha('captador'), t.task_id);
  assert.throws(() => tarefas.enviarRevisao(ficha('captador'), t.task_id, { fontes: ['x'] }, { objetivo_cumprido: true }), /qualidade incompleta/);
  const q = { objetivo_cumprido: true, dados_completos: false, sem_inconsistencias: true, sem_erros: true, fundamentada: true, nada_faltando: true, pode_concluir: true };
  assert.throws(() => tarefas.enviarRevisao(ficha('captador'), t.task_id, { ok: 1 }, q), /fontes/);
  tarefas.enviarRevisao(ficha('captador'), t.task_id, { fontes: ['entrada'] }, q);
  const r = tarefas.validar(ficha('ceo'), t.task_id);
  assert.equal(r.concluida, false);
  assert.ok(r.pendencias.includes('Os dados estão completos?'));
  assert.equal(tarefas.obter(t.task_id).status, 'REVIEW', 'sem confirmação, continua em REVIEW');
  assert.throws(() => tarefas.validar(ficha('captador'), t.task_id), /APPROVE/);
});

test('aprovação humana: só o proprietário decide e a aprovação vale só para os dados aprovados', () => {
  const t = nova('excluir registro antigo', { etapas: ['lancador'], entrada: { dados: 'a' } });
  assert.deepEqual(t.aprovacao.categorias, ['exclusao'], 'detecta a categoria pelo texto');
  tarefas.atribuir(ficha('ceo'), t.task_id, 'lancador');
  tarefas.iniciar(ficha('lancador'), t.task_id);
  const r1 = tarefas.executar(ficha('lancador'), t.task_id, { operacao: 'EXCLUIR', resumo: 'excluir' }, () => 'feito');
  assert.equal(r1.aguardandoAprovacao, true);
  assert.equal(tarefas.obter(t.task_id).status, 'WAITING');
  assert.throws(() => tarefas.decidirAprovacao(ficha('ceo'), t.task_id, true), /HUMAN_APPROVE/);
  tarefas.decidirAprovacao(P, t.task_id, true, 'ok');
  assert.throws(() => tarefas.complementar(P, t.task_id, 'b'), /Só se complementa/, 'aprovada: não aceita troca de dados');
  // Alguém altera os dados por fora depois da aprovação:
  A.armazem.comTrava(() => {
    const todas = A.armazem.lerJSON('tasks/dados/tarefas.json');
    todas[t.task_id].entrada.dados = 'outro';
    A.armazem.gravarJSON('tasks/dados/tarefas.json', todas);
  });
  tarefas.iniciar(ficha('lancador'), t.task_id);
  let rodou = false;
  const r2 = tarefas.executar(ficha('lancador'), t.task_id, { operacao: 'EXCLUIR', resumo: 'excluir' }, () => { rodou = true; });
  assert.equal(rodou, false, 'não executa com dados diferentes dos aprovados');
  assert.equal(r2.aguardandoAprovacao, true);
});

test('operação crítica nunca roda duas vezes; execução interrompida bloqueia', () => {
  const t = nova('registrar algo', { etapas: ['lancador'] });
  tarefas.atribuir(ficha('ceo'), t.task_id, 'lancador');
  tarefas.iniciar(ficha('lancador'), t.task_id);
  let vezes = 0;
  const op = { operacao: 'REGISTRAR', chave: 'k1' };
  tarefas.executar(ficha('lancador'), t.task_id, op, () => ++vezes);
  const r2 = tarefas.executar(ficha('lancador'), t.task_id, op, () => ++vezes);
  assert.equal(vezes, 1);
  assert.equal(r2.jaExecutada, true);
  assert.ok(A.acoesLog(t.task_id).includes('EXECUCAO_REPETIDA_BLOQUEADA'));
  // simula queda no meio de uma execução
  A.armazem.comTrava(() => {
    const todas = A.armazem.lerJSON('tasks/dados/tarefas.json');
    todas[t.task_id].execucoes.push({ chave: 'k2', operacao: 'OUTRA', status: 'INICIADA' });
    A.armazem.gravarJSON('tasks/dados/tarefas.json', todas);
  });
  assert.throws(() => tarefas.executar(ficha('lancador'), t.task_id, { operacao: 'OUTRA', chave: 'k2' }, () => ++vezes), /interrompida/);
  assert.equal(vezes, 1);
  assert.equal(tarefas.obter(t.task_id).status, 'BLOCKED');
});

test('auditoria: corrente de hashes detecta alteração e remoção; dados pessoais mascarados', () => {
  nova('primeira'); nova('segunda'); nova('terceira');
  auditoria.registrar({ agente: 'ceo', acao: 'TESTE', entrada: { cpf: '529.982.247-25', tel: '(11) 91234-5678', email: 'a@b.com' } });
  const arq = path.join(process.env.RACA_DADOS, 'logs/dados/auditoria.jsonl');
  const texto = fs.readFileSync(arq, 'utf8');
  assert.ok(!texto.includes('529.982.247-25') && !texto.includes('91234-5678') && !texto.includes('a@b.com'));
  assert.equal(auditoria.verificar().ok, true);
  const linhas = texto.trim().split('\n');
  fs.writeFileSync(arq, linhas.map((l, i) => (i === 1 ? l.replace('segunda', 'SEGUNDA') : l)).join('\n') + '\n');
  assert.equal(auditoria.verificar().ok, false, 'alteração detectada');
  fs.writeFileSync(arq, linhas.filter((_, i) => i !== 1).join('\n') + '\n');
  assert.equal(auditoria.verificar().ok, false, 'remoção detectada');
});

test('memória: três níveis com regras próprias', () => {
  const t = nova('tarefa com memória', { etapas: ['captador'] });
  memoria.gravarTarefa(ficha('captador'), t.task_id, 'dado', 'CPF 529.982.247-25');
  assert.ok(memoria.lerTarefa(ficha('captador'), t.task_id).dado);
  assert.throws(() => memoria.gravarOperacional(ficha('captador'), 'aluno', 'CPF 529.982.247-25'), /pessoais/);
  memoria.gravarOperacional(ficha('captador'), 'sinonimo_cel', 'celular = telefone');
  assert.throws(() => memoria.lerOperacional(ficha('lancador'), 'captador'), /não pode ler/);
  assert.ok(memoria.lerOperacional(ficha('ceo'), 'captador').sinonimo_cel);
  assert.throws(() => memoria.gravarEstrategica(ficha('captador'), 'x', 'y', 'justificativa longa'), /Só o CEO/);
  assert.throws(() => memoria.gravarEstrategica(ficha('ceo'), 'x', 'y', 'curta'), /justificativa/);
  memoria.gravarEstrategica(ficha('ceo'), 'prioridade_padrao', 'HIGH para matrículas', 'Proprietário pediu em reunião');
  assert.throws(() => memoria.gravarOperacional(ficha('captador'), 'grande', 'x'.repeat(2000)), /grande demais/);
  tarefas.mover(ficha('ceo'), t.task_id, 'CANCELLED', 'fim');
  assert.deepEqual(memoria.lerTarefa(ficha('captador'), t.task_id), {}, 'memória de tarefa descartada no fim');
  assert.ok(A.acoesLog(t.task_id).includes('MEMORIA_TAREFA_DESCARTADA'));
});

test('fichas: recusa campo faltando, todas as permissões, HUMAN_APPROVE, ferramenta externa e endereço externo', () => {
  const { agentes, skills } = registro.carregar();
  const ids = Object.keys(agentes);
  const base = JSON.parse(JSON.stringify(agentes.captador));
  const sem = Object.assign({}, base); delete sem.NON_RESPONSIBILITIES;
  assert.ok(registro.validarAgente(sem, ids, skills).some(p => p.includes('NON_RESPONSIBILITIES')));
  const todas = Object.assign({}, base, { PERMISSIONS: Object.keys(politica.PERMISSOES).filter(p => p !== 'HUMAN_APPROVE') });
  assert.ok(registro.validarAgente(todas, ids, skills).some(p => p.includes('todas as permissões')));
  assert.ok(registro.validarAgente(Object.assign({}, base, { PERMISSIONS: ['READ', 'HUMAN_APPROVE'] }), ids, skills).some(p => p.includes('HUMAN_APPROVE')));
  assert.ok(registro.validarAgente(Object.assign({}, base, { TOOLS: ['WHATSAPP'] }), ids, skills).some(p => p.includes('não permitida')));
  assert.ok(registro.validarAgente(Object.assign({}, base, { DESCRIPTION: 'usa https://site.com' }), ids, skills).some(p => p.includes('externa')));
  assert.ok(registro.validarAgente(Object.assign({}, base, { COMMUNICATION_PROTOCOL: Object.assign({}, base.COMMUNICATION_PROTOCOL, { acoes: ['DELEGATE'] }) }), ids, skills).some(p => p.includes('DELEGATE')));
});

test('versionamento: alterar ficha sem mudar a versão é recusado; nova versão fica no histórico', () => {
  registro.registro();
  const c = registro.carregar().agentes.captador;
  c.MISSION = c.MISSION + ' (alterada)';
  assert.throws(() => registro.registro(), /sem mudar a versão/);
  c.VERSION = '1.1';
  c.CHANGELOG = c.CHANGELOG.concat([{ versao: '1.1', data: '2026-10-16', mudanca: 'Missão revisada' }]);
  const reg = registro.registro();
  assert.equal(reg.agentes.captador.version, '1.1');
  assert.deepEqual(reg.agentes.captador.historico_versoes.map(h => h.versao), ['1.0', '1.1']);
  registro.limparCache();
});

test('registro: agente preparado não ativa sem implementação; só o proprietário muda status', () => {
  assert.throws(() => registro.mudarStatusAgente('financeiro', 'ACTIVE', P), /só preparado/);
  assert.throws(() => registro.mudarStatusAgente('captador', 'PAUSED', 'ceo'), /Só o proprietário/);
  registro.mudarStatusAgente('captador', 'PAUSED', P, 'férias');
  const linha = registro.linhaRegistro('captador');
  assert.equal(linha.status, 'PAUSED');
  ['agent_id', 'name', 'role', 'version', 'status', 'permissions', 'skills', 'last_activity', 'tasks_completed', 'tasks_failed'].forEach(k => assert.ok(k in linha, k));
});

test('prioridade: fila CRITICAL > HIGH > MEDIUM > LOW e mudança só com motivo', () => {
  const ids = ['LOW', 'CRITICAL', 'MEDIUM', 'HIGH'].map((p, i) => {
    const t = nova(`tarefa ${i}`, { prioridade: p, etapas: ['captador'] });
    tarefas.atribuir(ficha('ceo'), t.task_id, 'captador');
    return t.task_id;
  });
  assert.deepEqual(tarefas.fila('captador').map(t => t.prioridade), ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
  assert.throws(() => tarefas.reprioritizar(ficha('ceo'), ids[0], 'CRITICAL'), /motivo/);
  assert.throws(() => tarefas.reprioritizar(ficha('captador'), ids[0], 'CRITICAL', 'quero'), /DELEGATE/);
  tarefas.reprioritizar(ficha('ceo'), ids[0], 'CRITICAL', 'prazo do DETRAN');
  assert.deepEqual(tarefas.fila('captador').slice(0, 2).map(t => t.task_id), [ids[0], ids[1]], 'empate entre CRITICAL: quem chegou primeiro');
});

test('balanceamento: especialização, disponibilidade, carga e histórico', () => {
  const carga = n => Array.from({ length: n }, () => ({ prioridade: 'HIGH' }));
  const a = gestao.avaliarCandidato({ agente: 'a', especializacao: 2, disponivel: true, carga: carga(6), concluidas: 9, falhas: 1 });
  const b = gestao.avaliarCandidato({ agente: 'b', especializacao: 2, disponivel: true, carga: carga(1), concluidas: 5, falhas: 0 });
  const c = gestao.avaliarCandidato({ agente: 'c', especializacao: 5, disponivel: false, status: 'PAUSED', carga: [], concluidas: 0, falhas: 0 });
  const d = gestao.avaliarCandidato({ agente: 'd', especializacao: 2, disponivel: true, carga: carga(1), concluidas: 1, falhas: 4 });
  const ordem = [a, b, c, d].sort((x, y) => y.pontuacao - x.pontuacao).map(x => x.agente);
  assert.deepEqual(ordem, ['b', 'd', 'a', 'c']);
  assert.equal(a.sobrecarregado, true);
});

test('monitoramento: responde às 6 perguntas e aponta atrasadas', () => {
  nova('tarefa atrasada', { prazo: '2020-01-01', etapas: ['captador'] });
  const p = monitor.painel();
  ['Qual agente está trabalhando?', 'Qual agente está parado?', 'Qual agente está apresentando erros?', 'Qual agente está sobrecarregado?', 'Quais tarefas estão atrasadas?', 'Quais tarefas precisam de intervenção?']
    .forEach(q => assert.ok(q in p.perguntas, q));
  assert.equal(p.perguntas['Quais tarefas estão atrasadas?'].length, 1);
  assert.equal(p.agentes.quantidade, 9);
  ['pendentes', 'executando', 'concluidas', 'bloqueadas', 'com_erro'].forEach(k => assert.ok(k in p.tarefas));
  ['falhas', 'gargalos', 'inconsistencias', 'atrasadas'].forEach(k => assert.ok(k in p.sistema));
});

test('independência: nenhum código acessa rede, site ou sistema externo', () => {
  const raiz = path.join(__dirname, '..');
  const arquivos = [];
  const andar = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => {
    const p = path.join(d, e.name);
    if (e.isDirectory() && !['dados', 'node_modules', 'tests'].includes(e.name)) andar(p);
    else if (e.name.endsWith('.js')) arquivos.push(p);
  });
  andar(raiz);
  const proibido = /require\(['"](node:)?(https?|net|tls|dgram|dns|child_process)['"]\)|\bfetch\(|XMLHttpRequest|WebSocket/;
  arquivos.forEach(a => assert.ok(!proibido.test(fs.readFileSync(a, 'utf8')), `acesso externo em ${path.relative(raiz, a)}`));
  assert.ok(arquivos.length > 15);
});
