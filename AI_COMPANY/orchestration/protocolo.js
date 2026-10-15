'use strict';
/*
 * protocolo.js — comunicação padronizada entre agentes.
 *
 * Formato obrigatório de toda mensagem:
 * { task_id, from_agent, to_agent, action, priority, status, input, result, warnings, errors, timestamp }
 *
 * Antes de entregar, confere: formato, TASK_ID existente e igual ao da
 * tarefa, canal permitido entre os dois agentes, permissão para a ação,
 * destinatário ativo, e mensagem repetida (falha de comunicação) — que é
 * descartada em vez de processada duas vezes.
 */
const armazem = require('./armazem');
const registro = require('./registro');
const tarefas = require('./tarefas');
const auditoria = require('../logs/auditoria');
const politica = require('../permissions/politica');
const { STATUS, PRIORIDADES, AGENTE_HUMANO } = require('./definicoes');

const ARQ = 'tasks/dados/mensagens.json';
const CAMPOS = ['task_id', 'from_agent', 'to_agent', 'action', 'priority', 'status', 'input', 'result', 'warnings', 'errors', 'timestamp'];

class MensagemInvalida extends Error {
  constructor(problemas) {
    super('Mensagem recusada: ' + problemas.join('; '));
    this.problemas = problemas; this.codigo = 'MENSAGEM_INVALIDA'; this.nivel = 'MEDIUM';
  }
}

/* Monta uma mensagem no formato padrão (preenche horário e listas vazias). */
function montar(campos) {
  return {
    task_id: campos.task_id, from_agent: campos.from_agent, to_agent: campos.to_agent,
    action: campos.action, priority: campos.priority || 'MEDIUM', status: campos.status,
    input: campos.input || {}, result: campos.result || {}, warnings: campos.warnings || [],
    errors: campos.errors || [], timestamp: campos.timestamp || new Date().toISOString()
  };
}

/* Só o formato (sem consultar tarefas). */
function validarFormato(m) {
  const p = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['a mensagem não é um objeto'];
  CAMPOS.forEach(c => { if (!(c in m)) p.push(`campo ausente: ${c}`); });
  Object.keys(m).forEach(c => { if (!CAMPOS.includes(c)) p.push(`campo não previsto no protocolo: ${c}`); });
  if (p.length) return p;
  if (!tarefas.ID_VALIDO.test(m.task_id)) p.push(`task_id fora do formato TASK-AAAAMMDD-XXXX: ${m.task_id}`);
  if (!politica.ACOES[m.action]) p.push(`ação desconhecida: ${m.action}`);
  if (!PRIORIDADES.includes(m.priority)) p.push(`prioridade inválida: ${m.priority}`);
  if (!STATUS.includes(m.status)) p.push(`status inválido: ${m.status}`);
  ['input', 'result'].forEach(c => { if (!m[c] || typeof m[c] !== 'object' || Array.isArray(m[c])) p.push(`${c} deve ser um objeto`); });
  ['warnings', 'errors'].forEach(c => { if (!Array.isArray(m[c])) p.push(`${c} deve ser uma lista`); });
  if (isNaN(Date.parse(m.timestamp))) p.push('timestamp inválido');
  if (m.from_agent === m.to_agent) p.push('um agente não manda mensagem para si mesmo');
  // O TASK_ID não pode ser trocado no meio da conversa.
  ['input', 'result'].forEach(c => { if (m[c] && m[c].task_id && m[c].task_id !== m.task_id) p.push(`${c}.task_id (${m[c].task_id}) diferente do task_id da mensagem`); });
  return p;
}

/* Formato + regras da organização. Devolve a lista de problemas. */
function validar(m) {
  const p = validarFormato(m);
  if (p.length) return p;
  const de = registro.ficha(m.from_agent);
  const para = registro.ficha(m.to_agent);
  if (!de) p.push(`remetente inexistente: ${m.from_agent}`);
  if (!para) p.push(`destinatário inexistente: ${m.to_agent}`);
  if (p.length) return p;
  try { tarefas.obter(m.task_id); } catch (e) { p.push(`tarefa inexistente: ${m.task_id}`); }
  if (de !== AGENTE_HUMANO) {
    const st = registro.statusAgente(m.from_agent);
    // Agente em ERROR ainda pode (e deve) reportar o próprio erro ao CEO.
    const reportandoErro = st === 'ERROR' && m.action === 'ERROR_REPORT' && m.to_agent === 'ceo';
    if (st !== 'ACTIVE' && !reportandoErro) p.push(`remetente ${m.from_agent} não está ativo`);
    if (!de.COMMUNICATION_PROTOCOL.envia_para.includes(m.to_agent)) p.push(`${m.from_agent} não tem canal para enviar a ${m.to_agent}`);
    if (!de.COMMUNICATION_PROTOCOL.acoes.includes(m.action)) p.push(`${m.from_agent} não usa a ação ${m.action}`);
    const exige = politica.ACOES[m.action];
    if (!politica.tem(de, exige)) p.push(`${m.from_agent} não tem a permissão ${exige} exigida por ${m.action}`);
  }
  if (para !== AGENTE_HUMANO) {
    const st = registro.statusAgente(m.to_agent);
    if (st !== 'ACTIVE') p.push(`destinatário ${m.to_agent} está ${st}`);
    if (!para.COMMUNICATION_PROTOCOL.recebe_de.includes(m.from_agent)) p.push(`${m.to_agent} não recebe mensagens de ${m.from_agent}`);
  }
  return p;
}

/* Entrega a mensagem na caixa do destinatário. Mensagem idêntica já entregue é descartada. */
function enviar(m) {
  const problemas = validar(m);
  if (problemas.length) {
    auditoria.registrar({ task_id: m && m.task_id, agente: (m && m.from_agent) || 'desconhecido', acao: 'MENSAGEM_RECUSADA', entrada: m, erro: problemas.join('; '), status: 'ERROR' });
    throw new MensagemInvalida(problemas);
  }
  return armazem.comTrava(() => {
    const caixa = armazem.lerJSON(ARQ, { mensagens: [] });
    // Mesma mensagem no MESMO momento da tarefa = reenvio por falha (descarta).
    // Depois que a tarefa andou (histórico mudou), a repetição é legítima (nova rodada).
    const momento = tarefas.obter(m.task_id).historico.length;
    const assinatura = tarefas.hash({ t: m.task_id, f: m.from_agent, to: m.to_agent, a: m.action, s: m.status, i: m.input, r: m.result, momento });
    const repetida = caixa.mensagens.find(x => x.assinatura === assinatura);
    if (repetida) {
      auditoria.registrar({ task_id: m.task_id, agente: m.from_agent, acao: 'MENSAGEM_DUPLICADA', entrada: { action: m.action, to: m.to_agent }, decisao: 'Descartada: já entregue (provável reenvio por falha de comunicação).' });
      return { duplicada: true, id: repetida.id };
    }
    const id = caixa.mensagens.length + 1;
    caixa.mensagens.push({ id, assinatura, lida: false, entregue_em: new Date().toISOString(), mensagem: m });
    armazem.gravarJSON(ARQ, caixa);
    auditoria.registrar({ task_id: m.task_id, agente: m.from_agent, acao: `MENSAGEM_${m.action}`, entrada: m.input, saida: m.result, status: m.status, erro: m.errors.length ? m.errors : null, responsavel: m.to_agent });
    return { duplicada: false, id };
  });
}

function caixaDe(agente, { naoLidas = true } = {}) {
  const caixa = armazem.lerJSON(ARQ, { mensagens: [] });
  return caixa.mensagens.filter(x => x.mensagem.to_agent === agente && (!naoLidas || !x.lida));
}

function marcarLida(id) {
  armazem.comTrava(() => {
    const caixa = armazem.lerJSON(ARQ, { mensagens: [] });
    const x = caixa.mensagens.find(y => y.id === id);
    if (x) { x.lida = true; armazem.gravarJSON(ARQ, caixa); }
  });
}

function daTarefa(taskId) {
  return armazem.lerJSON(ARQ, { mensagens: [] }).mensagens.filter(x => x.mensagem.task_id === taskId).map(x => x.mensagem);
}

module.exports = { CAMPOS, MensagemInvalida, montar, validarFormato, validar, enviar, caixaDe, marcarLida, daTarefa };
