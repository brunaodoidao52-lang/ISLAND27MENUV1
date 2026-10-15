#!/usr/bin/env node
'use strict';
/*
 * raca.js — jeito fácil de usar os agentes da Auto Escola Raça.
 *
 *   ./raca                 menu com opções numeradas
 *   ./raca ficha           lança a ficha de um aluno (pergunta os dados um por um)
 *   ./raca pendencias      o que está esperando você
 *   ./raca aprovar         mostra o que precisa de aprovação e pergunta sim/não
 *   ./raca completar       completa os dados que faltaram numa ficha
 *   ./raca resolver        trata uma tarefa parada por erro
 *   ./raca status          resumo da equipe e das tarefas
 *   ./raca lancamentos     fichas já lançadas
 *   ./raca mensagens       mensagens do CEO para você
 *
 * Tudo que é perguntado também pode ir direto no comando (útil para o Claude):
 *   ./raca ficha --dados "Nome: ...\nCPF: ..."      ./raca aprovar 1 sim "conferi"
 *   ./raca completar 1 --dados "CPF: ..."           ./raca resolver 1 retomar "livro voltou"
 */
const readline = require('readline');
const registro = require('./orchestration/registro');
const tarefas = require('./orchestration/tarefas');
const protocolo = require('./orchestration/protocolo');
const executor = require('./orchestration/executor');
const monitor = require('./orchestration/monitor');
const armazem = require('./orchestration/armazem');
const auditoria = require('./logs/auditoria');
const { brl } = require('./skills/financial_analysis');
const doc = require('./skills/document_analysis');

const P = 'proprietario';

// ---------------------------------------------------------------- perguntas
let rl = null;
let filaLinhas = null;
/* Lê uma resposta. Funciona digitando ou com respostas enviadas pela entrada (testes). */
function perguntar(texto) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, terminal: false });
    filaLinhas = [];
    rl.on('line', l => { filaLinhas.push(l); if (rl._esperando) { const f = rl._esperando; rl._esperando = null; f(filaLinhas.shift()); } });
    rl.on('close', () => { rl._fechado = true; if (rl._esperando) { const f = rl._esperando; rl._esperando = null; f(null); } });
  }
  process.stdout.write(texto);
  if (filaLinhas.length) { const l = filaLinhas.shift(); if (!process.stdin.isTTY) process.stdout.write(l + '\n'); return Promise.resolve(l); }
  if (rl._fechado) return Promise.resolve(null);
  return new Promise(res => { rl._esperando = l => { if (l !== null && !process.stdin.isTTY) process.stdout.write(l + '\n'); res(l); }; });
}
function fechar() { if (rl) rl.close(); }

async function obrigatorio(texto) {
  for (;;) {
    const r = await perguntar(texto);
    if (r === null) throw new Error('Entrada encerrada antes do fim.');
    if (r.trim()) return r.trim();
    console.log('  (este campo é obrigatório)');
  }
}

async function escolher(texto, opcoes) {
  opcoes.forEach((o, i) => console.log(`  ${i + 1}. ${o}`));
  for (;;) {
    const r = await perguntar(texto);
    if (r === null) throw new Error('Entrada encerrada antes do fim.');
    const n = Number(r.trim());
    if (Number.isInteger(n) && n >= 1 && n <= opcoes.length) return n - 1;
    console.log(`  Digite um número de 1 a ${opcoes.length}.`);
  }
}

/* Pergunta de novo enquanto o formato estiver errado. vazio=true aceita deixar em branco. */
async function conferido(texto, valida, aviso, vazio = true) {
  for (;;) {
    const r = await perguntar(texto);
    if (r === null) throw new Error('Entrada encerrada antes do fim.');
    if (!r.trim() && vazio) return '';
    if (r.trim() && valida(r.trim())) return r.trim();
    console.log(`  ${r.trim() ? aviso : '(este campo é obrigatório)'}`);
  }
}
const ehData = v => !!doc.data(v);
const ehValor = v => doc.dinheiro(v) !== null;
const ehParcelas = v => /^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= 60;

/* Sim/não explícito. Sem resposta (ninguém digitando) NUNCA vira decisão: para sem fazer nada. */
async function simNao(texto) {
  for (;;) {
    const r = await perguntar(`${texto} (s/n): `);
    if (r === null) throw new Error('Sem resposta: nada foi feito.');
    if (/^(s|sim)$/i.test(r.trim())) return true;
    if (/^(n|nao|não)$/i.test(r.trim())) return false;
    console.log('  Responda s ou n.');
  }
}

// ---------------------------------------------------------------- textos
const linha = () => console.log('─'.repeat(60));
const nomeAluno = t => { const m = String((t.entrada && t.entrada.dados) || '').match(/^\s*nome[^:]*:\s*(.+)$/im); return m ? m[1].trim() : t.titulo; };

/* Mostra as mensagens novas do CEO em linguagem simples. */
function mostrarMensagens() {
  const itens = protocolo.caixaDe(P);
  itens.forEach(x => {
    const m = x.mensagem;
    linha();
    console.log(`${m.task_id}`);
    console.log(m.result.resumo || '(sem resumo)');
    (m.result.detalhes && m.result.detalhes.parcelas || []).forEach(p => console.log(`   • ${p.descricao}: ${brl(p.valor)} — vence ${p.vencimento.split('-').reverse().join('/')}`));
    m.warnings.filter(w => !/empresa\.js/.test(w)).forEach(w => console.log(`   ! ${w}`));
    m.errors.forEach(e => console.log(`   ✗ ${e.descricao}`));
    protocolo.marcarLida(x.id);
  });
  if (itens.length) linha();
  return itens.length;
}

/* Tudo que espera uma ação do proprietário, numerado. */
function listaPendencias() {
  return tarefas.listar().filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status)).map(t => {
    if (t.aprovacao.status === 'PENDENTE') return { t, tipo: 'aprovar', texto: `Aprovar: ${t.aprovacao.resumo}` };
    if (t.status === 'WAITING') return { t, tipo: 'completar', texto: `Faltam dados: ${nomeAluno(t)}` };
    if (t.status === 'ERROR' || t.status === 'BLOCKED') {
      const erro = [...t.erros].reverse().find(e => !e.resolvido);
      // Dado errado na ficha: o caminho é completar/corrigir, não "resolver".
      if (erro && erro.por === 'captador' && erro.nivel === 'MEDIUM') return { t, tipo: 'completar', texto: `Corrigir dados: ${nomeAluno(t)} — ${erro.descricao}` };
      return { t, tipo: 'resolver', texto: `Parada: ${nomeAluno(t)} — ${erro ? erro.descricao : (t.historico.slice(-1)[0] || {}).motivo || t.status}` };
    }
    return null;
  }).filter(Boolean);
}

function escolherDaLista(lista, arg) {
  if (!arg) return null;
  const n = Number(arg);
  if (Number.isInteger(n) && n >= 1 && n <= lista.length) return lista[n - 1];
  return lista.find(x => x.t.task_id === arg) || null;
}

async function selecionar(lista, arg, vazio, pergunta) {
  if (!lista.length) { console.log(vazio); return null; }
  const direto = escolherDaLista(lista, arg);
  if (direto) return direto;
  if (arg) throw new Error(`Não encontrei "${arg}" na lista. Use "./raca pendencias" para ver os números.`);
  if (lista.length === 1) { console.log(lista[0].texto); return lista[0]; }
  return lista[await escolher(pergunta, lista.map(x => x.texto))];
}

function opcoes(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const temValor = args[i + 1] !== undefined && !args[i + 1].startsWith('--');
      o[args[i].slice(2)] = temValor ? args[i + 1].replace(/\\n/g, '\n') : true;
      if (temValor) i++;
    } else o._.push(args[i]);
  }
  return o;
}

// ---------------------------------------------------------------- comandos
const comandos = {
  async ficha(o) {
    let dados = o.dados;
    if (!dados) {
      console.log('\nLançar ficha — responda e aperte Enter. Deixe em branco o que não tiver (* = obrigatório).\n');
      const v = {};
      v['Nome'] = await obrigatorio('Nome completo*: ');
      v['CPF'] = await conferido('CPF*: ', doc.cpfValido, 'CPF inválido. Confira os números.', false);
      v['Nascimento'] = await conferido('Data de nascimento (dd/mm/aaaa): ', ehData, 'Data inválida. Use dd/mm/aaaa.');
      v['Telefone'] = await perguntar('Telefone com DDD: ');
      v['E-mail'] = await perguntar('E-mail: ');
      v['Endereço'] = await perguntar('Endereço: ');
      console.log('Categoria*:');
      v['Categoria'] = doc.CATEGORIAS[await escolher('Número da categoria: ', doc.CATEGORIAS)];
      console.log('Serviço*:');
      v['Serviço'] = doc.SERVICOS[await escolher('Número do serviço: ', doc.SERVICOS)];
      v['Valor total'] = await conferido('Valor total* (ex.: 2.500,00): ', ehValor, 'Valor inválido. Exemplo: 2.500,00', false);
      v['Desconto'] = await conferido('Desconto (R$): ', ehValor, 'Valor inválido. Exemplo: 100,00');
      v['Entrada'] = await conferido('Entrada (R$): ', ehValor, 'Valor inválido. Exemplo: 500,00');
      if ((v['Entrada'] || '').trim()) {
        console.log('Forma da entrada:');
        v['Forma da entrada'] = doc.FORMAS[await escolher('Número da forma: ', doc.FORMAS)];
      }
      v['Parcelas'] = await conferido('Número de parcelas: ', ehParcelas, 'Digite um número de 1 a 60.');
      v['Primeiro vencimento'] = await conferido('1º vencimento (dd/mm/aaaa): ', ehData, 'Data inválida. Use dd/mm/aaaa.');
      dados = Object.entries(v).filter(([, x]) => x && String(x).trim()).map(([k, x]) => `${k}: ${String(x).trim()}`).join('\n');
      console.log('\nConfira:\n' + dados.split('\n').map(l => '  ' + l).join('\n'));
      if (!await simNao('\nEnviar ao CEO?')) { console.log('Nada foi enviado.'); return; }
    }
    const nome = (String(dados).match(/^\s*nome[^:]*:\s*(.+)$/im) || [])[1];
    const r = executor.pedido({ texto: `Lançar ficha de ${nome ? nome.trim() : 'aluno'}`, tipo: 'LANCAR_FICHA', dados, prioridade: o.prioridade });
    console.log(`\nTarefa ${r.task_id}${r.duplicada ? ' (já existia)' : ''}.`);
    mostrarMensagens();
    const pend = listaPendencias().find(x => x.t.task_id === r.task_id);
    if (pend) console.log(`Próximo passo: ./raca ${pend.tipo}`);
  },

  async pendencias() {
    const lista = listaPendencias();
    if (!lista.length) { console.log('Nada esperando por você. 👍'); return; }
    console.log('\nO que está esperando você:\n');
    lista.forEach((x, i) => console.log(`  ${i + 1}. ${x.texto}\n     → ./raca ${x.tipo} ${i + 1}`));
    console.log();
  },

  async aprovar(o) {
    const lista = listaPendencias().filter(x => x.tipo === 'aprovar');
    const item = await selecionar(lista, o._[0], 'Nenhuma aprovação pendente.', 'Qual aprovar? ');
    if (!item) return;
    const a = item.t.aprovacao;
    linha();
    console.log(a.resumo);
    ((a.dados && a.dados.parcelas) || []).forEach(p => console.log(`   • ${p.descricao}: ${brl(p.valor)} — vence ${p.vencimento.split('-').reverse().join('/')}`));
    linha();
    if ('ver' in o) { console.log(`Para decidir: ./raca aprovar ${o._[0] || item.t.task_id} sim|nao "observação"`); return; }
    let decisao = o._[1];
    if (!decisao) decisao = (await simNao('Aprovar?')) ? 'sim' : 'nao';
    if (!/^(sim|s|nao|não|n)$/i.test(decisao)) throw new Error('Responda sim ou nao.');
    const aprova = /^(sim|s)$/i.test(decisao);
    const motivo = o._.slice(2).join(' ') || (o._[1] ? '' : await perguntar('Observação (opcional): ')) || (aprova ? 'aprovado pelo proprietário' : 'negado pelo proprietário');
    tarefas.decidirAprovacao(P, item.t.task_id, aprova, motivo);
    executor.avisarCeo(item.t.task_id, { aprovacao: aprova ? 'APROVADA' : 'NEGADA' });
    mostrarMensagens();
  },

  async completar(o) {
    const lista = listaPendencias().filter(x => x.tipo === 'completar');
    const item = await selecionar(lista, o._[0], 'Nenhuma ficha esperando dados.', 'Qual completar? ');
    if (!item) return;
    const ultima = protocolo.daTarefa(item.t.task_id).filter(m => m.from_agent === 'captador').slice(-1)[0];
    const r = (ultima && ultima.result) || {};
    let novos = o.dados;
    if (!novos) {
      console.log(`\n${nomeAluno(item.t)} — o CAPTADOR pediu:`);
      (ultima ? ultima.warnings : []).forEach(w => console.log(`  • ${w}`));
      const campos = [...(r.faltando || []), ...((r.invalidos || []).map(i => i.campo)), ...((r.conflitos || []).map(c => c.campo)), ...((r.ambiguos || []).map(a => a.campo))];
      const rotulo = { nome: 'Nome', cpf: 'CPF', categoria: 'Categoria', servico: 'Serviço', valor_total: 'Valor total', parcelas: 'Parcelas', primeiro_vencimento: 'Primeiro vencimento', forma_entrada: 'Forma da entrada', nascimento: 'Nascimento', telefone: 'Telefone', email: 'E-mail', entrada: 'Entrada', desconto: 'Desconto' };
      const respostas = [];
      for (const c of [...new Set(campos)]) {
        if (c === 'categoria') { respostas.push(`Categoria: ${doc.CATEGORIAS[await escolher('Categoria: ', doc.CATEGORIAS)]}`); continue; }
        if (c === 'servico') { respostas.push(`Serviço: ${doc.SERVICOS[await escolher('Serviço: ', doc.SERVICOS)]}`); continue; }
        if (c === 'forma_entrada') { respostas.push(`Forma da entrada: ${doc.FORMAS[await escolher('Forma da entrada: ', doc.FORMAS)]}`); continue; }
        const regra = { cpf: [doc.cpfValido, 'CPF inválido.'], nascimento: [ehData, 'Use dd/mm/aaaa.'], primeiro_vencimento: [ehData, 'Use dd/mm/aaaa.'], valor_total: [ehValor, 'Exemplo: 2.500,00'], entrada: [ehValor, 'Exemplo: 500,00'], desconto: [ehValor, 'Exemplo: 100,00'], parcelas: [ehParcelas, 'De 1 a 60.'] }[c];
        const v = regra ? await conferido(`${rotulo[c] || c}: `, regra[0], regra[1], false) : await obrigatorio(`${rotulo[c] || c}: `);
        respostas.push(`${rotulo[c] || c}: ${v}`);
      }
      novos = respostas.join('\n');
      if (!novos) novos = await obrigatorio('O que corrigir (campo: valor): ');
    }
    // A versão nova de um campo substitui a antiga (evita "CPF" duas vezes com valores diferentes).
    const t = item.t;
    tarefas.complementar(P, t.task_id, novos, { substituir: true });
    executor.avisarCeo(t.task_id, { complemento: true });
    mostrarMensagens();
    const pend = listaPendencias().find(x => x.t.task_id === t.task_id);
    if (pend) console.log(`Próximo passo: ./raca ${pend.tipo}`);
  },

  async resolver(o) {
    const lista = listaPendencias().filter(x => x.tipo === 'resolver');
    const item = await selecionar(lista, o._[0], 'Nenhuma tarefa parada por erro.', 'Qual resolver? ');
    if (!item) return;
    const t = item.t;
    const incerta = t.execucoes.some(e => e.status === 'INCERTA' || e.status === 'INICIADA');
    const acoes = incerta
      ? ['Confirmar que a gravação ACONTECEU', 'Confirmar que a gravação NÃO aconteceu', 'Cancelar a tarefa']
      : ['Tentar de novo (já resolvi a causa)', 'Cancelar a tarefa'];
    const mapa = incerta ? ['aconteceu', 'nao-aconteceu', 'cancelar'] : ['retomar', 'cancelar'];
    let acao = o._[1];
    if (!acao) {
      console.log(`\n${item.texto}\nO que fazer?`);
      acao = mapa[await escolher('Opção: ', acoes)];
    }
    const motivo = o._.slice(2).join(' ') || await obrigatorio('Explique em poucas palavras (fica no histórico): ');
    if (acao === 'cancelar') { tarefas.mover(P, t.task_id, 'CANCELLED', motivo); console.log(`${t.task_id} cancelada.`); return; }
    if (acao === 'aconteceu' || acao === 'nao-aconteceu') tarefas.confirmarExecucao(P, t.task_id, acao === 'aconteceu', motivo);
    else if (acao !== 'retomar') throw new Error('Opção inválida: use retomar, cancelar, aconteceu ou nao-aconteceu.');
    const rodada = tarefas.retomar(P, t.task_id, motivo);
    executor.avisarCeo(t.task_id, { retomar: true, rodada });
    mostrarMensagens();
  },

  async status() {
    const p = monitor.painel();
    console.log('\nEquipe:');
    p.agentes.lista.forEach(a => {
      const estado = { ACTIVE: a.trabalhando ? 'trabalhando' : 'livre', INACTIVE: 'desativado', PAUSED: 'pausado', ERROR: 'COM ERRO' }[a.status];
      console.log(`  ${a.name.padEnd(20)} ${estado.padEnd(12)} concluídas: ${a.tasks_completed}  falhas: ${a.tasks_failed}${a.sobrecarregado ? '  SOBRECARREGADO' : ''}`);
    });
    const s = p.tarefas.por_status;
    console.log(`\nTarefas: ${p.tarefas.total} no total — ${s.COMPLETED} concluídas, ${s.IN_PROGRESS} em andamento, ${s.WAITING} esperando, ${s.ERROR + s.BLOCKED} paradas, ${s.CANCELLED} canceladas.`);
    const q = p.perguntas;
    if (q['Quais tarefas estão atrasadas?'].length) console.log(`Atrasadas: ${q['Quais tarefas estão atrasadas?'].join(', ')}`);
    const pend = listaPendencias().length;
    console.log(pend ? `\n${pend} coisa(s) esperando você → ./raca pendencias` : '\nNada esperando você.');
    const log = auditoria.verificar();
    if (!log.ok) console.log(`\n⚠ O histórico (log) tem problemas: ${log.problemas[0]}`);
  },

  async lancamentos() {
    const l = armazem.lerJSON('tasks/dados/lancamentos.json', { lancamentos: [] }).lancamentos;
    if (!l.length) { console.log('Nenhuma ficha lançada ainda.'); return; }
    l.forEach(x => console.log(`  nº ${String(x.numero).padStart(3)}  ${x.ficha.nome.padEnd(28)} ${x.ficha.servico} (${x.ficha.categoria})  ${brl(x.valor_final)}  em ${x.registrado_em.slice(0, 10).split('-').reverse().join('/')}`));
  },

  async mensagens() { if (!mostrarMensagens()) console.log('Nenhuma mensagem nova.'); },

  async menu() {
    const itens = [
      ['Lançar ficha de aluno', 'ficha'], ['Ver o que está esperando você', 'pendencias'], ['Aprovar ou negar', 'aprovar'],
      ['Completar dados que faltaram', 'completar'], ['Resolver tarefa parada', 'resolver'], ['Resumo da equipe', 'status'],
      ['Fichas lançadas', 'lancamentos'], ['Mensagens', 'mensagens'], ['Sair', null]
    ];
    console.log('\nAUTO ESCOLA RAÇA — equipe de agentes');
    const pend = listaPendencias().length;
    if (pend) console.log(`(${pend} coisa(s) esperando você)`);
    const i = await escolher('\nEscolha: ', itens.map(x => x[0]));
    if (itens[i][1]) await comandos[itens[i][1]]({ _: [] });
  },

  async ajuda() {
    console.log(`
Comandos (digite ./raca e o nome):
  (nada)        menu com opções numeradas
  ficha         lançar ficha de um aluno (pergunta os dados)
  pendencias    o que está esperando você
  aprovar       aprovar ou negar um lançamento
  completar     completar dados que faltaram
  resolver      tratar uma tarefa parada por erro
  status        resumo da equipe e das tarefas
  lancamentos   fichas já lançadas
  mensagens     mensagens do CEO

Comandos avançados: node AI_COMPANY/empresa.js ajuda`);
  }
};

async function principal(argv) {
  const [cmd, ...resto] = argv;
  const nome = { '': 'menu', menu: 'menu', ficha: 'ficha', pendencias: 'pendencias', 'pendências': 'pendencias', aprovar: 'aprovar', completar: 'completar', resolver: 'resolver', status: 'status', lancamentos: 'lancamentos', 'lançamentos': 'lancamentos', mensagens: 'mensagens', ajuda: 'ajuda', '--help': 'ajuda' }[cmd || ''];
  if (!nome) { console.log(`Não conheço "${cmd}".`); await comandos.ajuda(); process.exitCode = 1; return; }
  await comandos[nome](opcoes(resto));
}

if (require.main === module) {
  principal(process.argv.slice(2))
    .catch(e => { console.error(`\nNão deu certo: ${e.message}`); process.exitCode = 1; })
    .finally(fechar);
}

module.exports = { principal };
