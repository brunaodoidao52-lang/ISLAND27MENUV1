#!/usr/bin/env node
'use strict';
/*
 * empresa.js — painel de comando do PROPRIETÁRIO da Auto Escola Raça.
 * Quem usa este programa age como proprietário; os agentes agem pelo executor.
 *
 *   node AI_COMPANY/empresa.js ajuda
 */
const fs = require('fs');
const registro = require('./orchestration/registro');
const tarefas = require('./orchestration/tarefas');
const protocolo = require('./orchestration/protocolo');
const executor = require('./orchestration/executor');
const monitor = require('./orchestration/monitor');
const auditoria = require('./logs/auditoria');
const armazem = require('./orchestration/armazem');
const { AGENTE_HUMANO } = require('./orchestration/definicoes');

const P = AGENTE_HUMANO;
const AJUDA = `
Auto Escola Raça — organização de agentes (proprietário)

  registro                         AGENT REGISTRY (status, versão, permissões, skills, contadores)
  skills                           Skills compartilhadas e quem usa
  ativar|pausar|desativar <agente> Muda o status de um agente
  pedido "<texto>" [--tipo LANCAR_FICHA] [--prioridade HIGH] [--prazo AAAA-MM-DD] [--arquivo dados.txt]
                                   Envia um pedido ao CEO
  complementar <TASK> --arquivo dados.txt | "campo: valor"
                                   Completa/corrige os dados de uma tarefa parada
  retomar <TASK> "o que foi resolvido"
                                   Continua uma tarefa parada por erro depois de resolver a causa
  confirmar-execucao <TASK> sim|nao "como conferiu"
                                   Diz se uma execução incerta/interrompida aconteceu
  aprovar <TASK> "motivo"          Concede a aprovação humana pendente
  negar <TASK> "motivo"            Nega a aprovação humana pendente
  cancelar <TASK> "motivo"         Cancela uma tarefa
  prioridade <TASK> <CRITICAL|HIGH|MEDIUM|LOW> "motivo"
  tarefas [--status X]             Lista tarefas
  tarefa <TASK>                    Detalhe: etapas, mensagens e log da tarefa
  caixa                            Mensagens do CEO para você
  painel                           Monitoramento (as 6 perguntas do CEO)
  livro                            Lançamentos registrados no livro interno
  log [TASK]                       Log de auditoria
  verificar-log                    Confere se o log foi adulterado
  processar                        Faz os agentes processarem as mensagens pendentes
`;

function opcoes(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) { o[args[i].slice(2)] = args[i + 1]; i++; } else o._.push(args[i]);
  }
  return o;
}

const mostrar = v => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));

function lerArquivo(arq) {
  if (!fs.existsSync(arq)) throw new Error(`Arquivo não encontrado: ${arq}`);
  if (fs.statSync(arq).size > 1024 * 1024) throw new Error('Arquivo grande demais (limite 1 MB).');
  return fs.readFileSync(arq, 'utf8');
}

function mostrarCaixa() {
  const itens = protocolo.caixaDe(P);
  if (!itens.length) return mostrar('Nenhuma mensagem nova.');
  itens.forEach(x => {
    const m = x.mensagem;
    console.log(`\n[${m.timestamp}] ${m.task_id} — de ${m.from_agent} (${m.status}, ${m.priority})`);
    if (m.result.resumo) console.log(m.result.resumo);
    m.warnings.forEach(w => console.log(`  aviso: ${w}`));
    m.errors.forEach(e => console.log(`  erro ${e.nivel}: ${e.descricao} (causa: ${e.causa})`));
    protocolo.marcarLida(x.id);
  });
}

function main(argv) {
  const [cmd, ...resto] = argv;
  const o = opcoes(resto);
  switch (cmd) {
    case undefined: case 'ajuda': case '--help': return mostrar(AJUDA);
    case 'registro': return console.table(registro.listarRegistro().map(r => ({ agente: r.agent_id, nome: r.name, versao: r.version, status: r.status, permissoes: r.permissions.join(','), skills: r.skills.length, concluidas: r.tasks_completed, falhas: r.tasks_failed, ultima_atividade: r.last_activity || '—', implementado: r.implementado ? 'sim' : 'preparado' })));
    case 'skills': return console.table(Object.values(registro.carregar().skills).map(s => ({ skill: s.SKILL_ID, nome: s.NAME, versao: s.VERSION, usada_por: s.USED_BY.join(', ') })));
    case 'ativar': case 'pausar': case 'desativar': {
      const novo = { ativar: 'ACTIVE', pausar: 'PAUSED', desativar: 'INACTIVE' }[cmd];
      registro.mudarStatusAgente(o._[0], novo, P, o._[1] || '');
      mostrar(`${o._[0]} → ${novo}`);
      if (novo === 'ACTIVE') executor.ciclo();
      return;
    }
    case 'pedido': {
      const dados = o.arquivo ? lerArquivo(o.arquivo) : undefined;
      const r = executor.pedido({ texto: o._.join(' '), tipo: o.tipo, prioridade: o.prioridade, prazo: o.prazo, dados });
      mostrar(r);
      return mostrarCaixa();
    }
    case 'complementar': {
      const id = o._[0];
      // "Parcelas: 4" sem aspas chega como dois pedaços; cada pedaço com ":" é uma linha.
      const partes = o._.slice(1);
      const novos = o.arquivo ? lerArquivo(o.arquivo) : (partes.every(x => x.includes(':')) ? partes.join('\n') : partes.join(' '));
      tarefas.complementar(P, id, novos);
      executor.avisarCeo(id, { complemento: true });
      return mostrarCaixa();
    }
    case 'confirmar-execucao': {
      const id = o._[0];
      if (!['sim', 'nao', 'não'].includes(o._[1])) throw new Error('Responda sim ou nao.');
      tarefas.confirmarExecucao(P, id, o._[1] === 'sim', o._.slice(2).join(' '));
      return mostrar(`Registrado. Agora use: retomar ${id} "motivo"`);
    }
    case 'retomar': {
      const id = o._[0];
      const rodada = tarefas.retomar(P, id, o._.slice(1).join(' '));
      executor.avisarCeo(id, { retomar: true, rodada });
      return mostrarCaixa();
    }
    case 'aprovar': case 'negar': {
      const id = o._[0];
      tarefas.decidirAprovacao(P, id, cmd === 'aprovar', o._.slice(1).join(' '));
      executor.avisarCeo(id, { aprovacao: cmd === 'aprovar' ? 'APROVADA' : 'NEGADA' });
      return mostrarCaixa();
    }
    case 'cancelar': tarefas.mover(P, o._[0], 'CANCELLED', o._.slice(1).join(' ') || 'cancelada pelo proprietário'); return mostrar(`${o._[0]} cancelada.`);
    case 'prioridade': tarefas.reprioritizar(P, o._[0], o._[1], o._.slice(2).join(' ')); return mostrar(`${o._[0]} → ${o._[1]}`);
    case 'tarefas': return console.table(tarefas.listar(o.status ? { status: o.status } : {}).map(t => ({ task_id: t.task_id, titulo: t.titulo.slice(0, 40), status: t.status, prioridade: t.prioridade, responsavel: t.responsavel || '—', aprovacao: t.aprovacao.status })));
    case 'tarefa': {
      const t = tarefas.obter(o._[0]);
      mostrar(Object.assign({}, t, { mensagens: protocolo.daTarefa(t.task_id).length }));
      return;
    }
    case 'caixa': return mostrarCaixa();
    case 'painel': return mostrar(monitor.painel());
    case 'livro': return mostrar(armazem.lerJSON('tasks/dados/lancamentos.json', { lancamentos: [] }).lancamentos);
    case 'log': return auditoria.listar(o._[0] ? { task_id: o._[0] } : {}).forEach(r => console.log(`${r.seq} ${r.horario} ${r.task_id || '-'} ${r.agente} ${r.acao} ${r.status || ''} ${r.erro ? 'ERRO: ' + JSON.stringify(r.erro) : ''}`));
    case 'verificar-log': { const v = auditoria.verificar(); mostrar(v.ok ? `Log íntegro (${v.total} registros).` : v); return v.ok ? 0 : process.exit(1); }
    case 'processar': return mostrar(`${executor.ciclo()} mensagem(ns) processada(s).`);
    default: mostrar(`Comando desconhecido: ${cmd}\n${AJUDA}`); process.exitCode = 1;
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) {
    console.error(`Erro: ${e.message}`);
    process.exitCode = 1;
  }
}

module.exports = { main };
