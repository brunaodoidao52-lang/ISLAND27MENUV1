'use strict';
/*
 * monitor.js — visão geral do CEO (AGENTE CEO — MONITORAMENTO).
 *
 * Responde:
 *  "Qual agente está trabalhando?"        "Qual agente está parado?"
 *  "Qual agente está apresentando erros?" "Qual agente está sobrecarregado?"
 *  "Quais tarefas estão atrasadas?"       "Quais tarefas precisam de intervenção?"
 */
const registro = require('./registro');
const tarefas = require('./tarefas');
const auditoria = require('../logs/auditoria');
const { FINAIS, STATUS } = require('./definicoes');
const auditing = require('../skills/auditing');
const dados = require('../skills/data_analysis');
const { LIMITE_CARGA } = require('../skills/task_management');

function painel(agora = Date.now()) {
  const reg = registro.listarRegistro();
  const todas = tarefas.listar();
  const abertas = todas.filter(t => !FINAIS.includes(t.status));
  const porStatus = Object.fromEntries(STATUS.map(s => [s, todas.filter(t => t.status === s).length]));

  const agentes = reg.map(r => {
    const minhas = abertas.filter(t => t.responsavel === r.agent_id);
    const errosAbertos = todas.filter(t => t.erros.some(e => !e.resolvido && e.por === r.agent_id));
    return Object.assign({}, r, {
      tarefas_abertas: minhas.length,
      trabalhando: minhas.some(t => t.status === 'IN_PROGRESS'),
      parado: r.status === 'ACTIVE' && minhas.length === 0,
      com_erros: r.status === 'ERROR' || errosAbertos.length > 0,
      erros_abertos: errosAbertos.map(t => t.task_id),
      sobrecarregado: minhas.length >= LIMITE_CARGA,
      produtividade: dados.taxa(r.tasks_completed, r.tasks_completed + r.tasks_failed)
    });
  });

  const atrasadas = abertas.filter(t => t.prazo && Date.parse(t.prazo) < agora);
  const intervencao = abertas.filter(t => t.aprovacao.status === 'PENDENTE' || t.status === 'BLOCKED' || t.status === 'ERROR' ||
    t.erros.some(e => !e.resolvido && e.intervencao_humana));
  const statusAgentes = Object.fromEntries(reg.map(r => [r.agent_id, r.status]));
  const log = auditoria.verificar();
  const gargalos = [
    ...auditing.paradas(abertas, 24, agora).map(t => ({ task_id: t.task_id, problema: `Parada em ${t.status} há mais de 24 h (responsável: ${t.responsavel || '—'}).` })),
    ...agentes.filter(a => a.sobrecarregado).map(a => ({ agente: a.agent_id, problema: `${a.tarefas_abertas} tarefas abertas (limite ${LIMITE_CARGA}).` })),
  ];
  const esperandoAprovacao = abertas.filter(t => t.aprovacao.status === 'PENDENTE').length;
  if (esperandoAprovacao >= 3) gargalos.push({ problema: `${esperandoAprovacao} tarefas esperando aprovação humana.` });

  return {
    gerado_em: new Date(agora).toISOString(),
    agentes: {
      quantidade: reg.length,
      por_status: dados.contarPor(reg, 'status'),
      lista: agentes
    },
    tarefas: {
      total: todas.length,
      por_status: porStatus,
      pendentes: abertas.filter(t => ['PENDING', 'ASSIGNED', 'WAITING'].includes(t.status)).map(t => t.task_id),
      executando: abertas.filter(t => t.status === 'IN_PROGRESS').map(t => t.task_id),
      concluidas: todas.filter(t => t.status === 'COMPLETED').map(t => t.task_id),
      bloqueadas: abertas.filter(t => t.status === 'BLOCKED').map(t => t.task_id),
      com_erro: abertas.filter(t => t.status === 'ERROR').map(t => t.task_id)
    },
    sistema: {
      falhas: log.ok ? [] : log.problemas.map(p => `Log de auditoria: ${p}`),
      gargalos,
      inconsistencias: auditing.inconsistenciasTarefas(todas, reg.map(r => r.agent_id), statusAgentes),
      atrasadas: atrasadas.map(t => ({ task_id: t.task_id, prazo: t.prazo, status: t.status, responsavel: t.responsavel }))
    },
    perguntas: {
      'Qual agente está trabalhando?': agentes.filter(a => a.trabalhando).map(a => a.agent_id),
      'Qual agente está parado?': agentes.filter(a => a.parado).map(a => a.agent_id),
      'Qual agente está apresentando erros?': agentes.filter(a => a.com_erros).map(a => a.agent_id),
      'Qual agente está sobrecarregado?': agentes.filter(a => a.sobrecarregado).map(a => a.agent_id),
      'Quais tarefas estão atrasadas?': atrasadas.map(t => t.task_id),
      'Quais tarefas precisam de intervenção?': intervencao.map(t => ({ task_id: t.task_id, motivo: t.aprovacao.status === 'PENDENTE' ? 'HUMAN APPROVAL REQUIRED' : t.status }))
    }
  };
}

module.exports = { painel };
